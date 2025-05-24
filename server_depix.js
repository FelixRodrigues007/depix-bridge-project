/**
 * DePix-Bridge  —  versão 2025-05-24 (modificada)
 * ✔ QR dinâmico (Tag 01 = 12)
 * ✔ Valor fixo ou aberto (Tag 54 opcional)
 * ✔ Sanitiza chave telefone e TXID
 * ✔ Endpoint /api/qr devolve PNG 512 px
 */

const express = require("express");
const qrcode  = require("qrcode");
const { payments, networks } = require("liquidjs-lib");
const ecc = require("tiny-secp256k1");
const ECPair = require("ecpair").ECPairFactory(ecc);

const app  = express();
const port = process.env.PORT || 10000;
app.use(express.json());

/*──────────────── helpers ───────────────*/

const tlv = (tag, value="") =>
  `${tag}${value.length.toString().padStart(2,"0")}${value}`;

function crc16(data){
  let crc=0xffff,p=0x1021;
  for(const c of data){
    crc^=c.charCodeAt(0)<<8;
    for(let i=0;i<8;i++)
      crc=crc&0x8000?((crc<<1)^p)&0xffff:(crc<<1)&0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4,"0");
}

function cleanPixKey(key){
  // tira +, espaços e headers "pix:" se vierem
  return key.replace(/^pix:\/\//i,"").replace(/\+/,"").trim();
}
function cleanTxid(text){
  return text
    .toUpperCase()
    .replace(/[^0-9A-Z.\-/_]/g,"")      // remove caracteres proibidos
    .slice(0,25) || "DEPX";             // mínimo exigido
}

/*──────────── payload EMV-QR ───────────*/

function buildPayload(pixKey,amount,txid,merchant="DEPX",city="BRASIL"){
  const mInfo = tlv("00","BR.GOV.BCB.PIX")+tlv("01",pixKey);
  const add   = tlv("62", tlv("05", txid));

  // Se o valor não for positivo, o campo do valor fica vazio
  const amountField = (amount > 0) ? tlv("54",amount.toFixed(2)) : "";

  let p =
    tlv("00","01") +               // format indicator
    tlv("01","12") +               // QR dinâmico
    tlv("26",mInfo) +
    tlv("52","0000") +
    tlv("53","986") +
    amountField +                  // Adiciona o valor apenas se ele existir
    tlv("58","BR") +
    tlv("59",merchant.slice(0,25).toUpperCase()) +
    tlv("60",city.slice(0,15).toUpperCase()) +
    add +
    "6304";
  return p + crc16(p);
}

/*──────────── rotas ───────────*/

app.get("/",(_,res)=>res.send("DePix-Bridge OK"));

app.get("/api/generate-pix-qrcode", async (req,res)=>{
  let { pix_key, amount, description="DEPX" } = req.query;
  if(!pix_key) return res.status(400).json({error:"pix_key obrigatório"});

  // O valor agora é opcional. Se for fornecido, deve ser um número válido.
  let value = 0.0;
  if (amount) {
    value = parseFloat(amount);
    if (isNaN(value) || value < 0) { // Permite 0, mas não negativo
      return res.status(400).json({error:"amount inválido"});
    }
  }

  const cleanKey  = cleanPixKey(pix_key);
  const txid      = cleanTxid(description);

  // A função buildPayload omitirá o campo de valor se 'value' for 0
  const payload   = buildPayload(cleanKey, value, txid);
  const pngBase64 = await qrcode.toDataURL(payload,{margin:8,width:512});
  const qrLink    = `${req.protocol}://${req.get("host")}/api/qr?payload=${encodeURIComponent(payload)}`;

  // Também torna o valor opcional no URI de pagamento
  const amountUriPart = value > 0 ? `&amount=${value.toFixed(2)}` : "";
  const paymentUri = `pix://${cleanKey}?description=${txid}${amountUriPart}`.replace('?&', '?');

  res.json({
    pix_code: payload,
    qr_code_data_url: pngBase64,
    qr_link: qrLink,
    payment_uri: paymentUri
  });
});


app.get("/api/qr", async (req,res)=>{
  const {payload}=req.query;
  if(!payload) return res.status(400).send("payload ausente");
  try{
    const png=await qrcode.toBuffer(payload,{margin:8,width:512});
    res.type("png").send(png);
  }catch(err){
    res.status(500).send("erro QR");
  }
});

/*──────────── start ───────────*/
app.listen(port, ()=>console.log(`DePix-Bridge na porta ${port}`));
