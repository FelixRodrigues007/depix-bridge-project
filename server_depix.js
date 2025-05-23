const express = require("express");
const app = express();
const port = process.env.PORT || 3001;

// Informações públicas do token DePix
const DEPIX_ASSET_ID = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";
const DEPIX_NAME = "Decentralized Pix";
const DEPIX_TICKER = "DePix";
const DEPIX_PRECISION = 8;
const LIQUID_EXPLORER_URL = "https://blockstream.info/liquid/asset/";

// Dependências para Liquid e QR Code
const { payments, networks } = require("liquidjs-lib") ;
const ecc = require("tiny-secp256k1");
const { ECPairFactory } = require("ecpair");
const qrcode = require("qrcode");

const ECPair = ECPairFactory(ecc);

app.get("/api/depix-info", (req, res) => {
  res.json({
    asset_id: DEPIX_ASSET_ID,
    name: DEPIX_NAME,
    ticker: DEPIX_TICKER,
    precision: DEPIX_PRECISION,
    explorer_link: `${LIQUID_EXPLORER_URL}${DEPIX_ASSET_ID}`,
  });
});

// Rota para gerar um novo endereço DePix (P2WPKH na Liquid)
app.get("/api/generate-depix-address", (req, res) => {
  try {
    const keyPair = ECPair.makeRandom();
    // Garantir que a publicKey é um Buffer
    const publicKeyAsBuffer = Buffer.isBuffer(keyPair.publicKey) ? keyPair.publicKey : Buffer.from(keyPair.publicKey);
    
    const { address } = payments.p2wpkh({
      pubkey: publicKeyAsBuffer, // Usar o Buffer explicitamente
      network: networks.liquid,
    });

    res.json({
      address: address,
      message: "Este é um endereço padrão da Liquid (P2WPKH). Para transações confidenciais completas, a gestão de blinding keys é necessária.",
    });
  } catch (error) {
    console.error("Erro ao gerar endereço DePix:", error);
    res.status(500).json({ error: "Falha ao gerar endereço DePix", details: error.message });
  }
});

// Rota para gerar um QR Code para um endereço DePix (ou Liquid)
app.get("/api/generate-depix-qrcode", async (req, res) => {
  const { address, amount, message } = req.query;

  if (!address) {
    return res.status(400).json({ error: "O parâmetro 'address' é obrigatório." });
  }

  let qrData = address;
  const params = [];
  if (amount) {
    params.push(`amount=${encodeURIComponent(amount)}`);
  }
  if (amount) { // Adicionar assetid apenas se houver valor
    const assetid = req.query.assetid || DEPIX_ASSET_ID;
    params.push(`assetid=${encodeURIComponent(assetid)}`);
  }
  if (message) {
    params.push(`message=${encodeURIComponent(message)}`);
  }

  if (params.length > 0) {
    qrData = `liquidnetwork:${address}?${params.join("&")}`;
  }

  try {
    const qrCodeDataURL = await qrcode.toDataURL(qrData);
    res.json({
      qr_code_data_url: qrCodeDataURL,
      payment_uri: qrData,
    });
  } catch (error) {
    console.error("Erro ao gerar QR Code:", error);
    res.status(500).json({ error: "Falha ao gerar QR Code", details: error.message });
  }
});

// Função para gerar o payload PIX no formato EMV
function generatePixPayload(pixKey, amount, description = "", merchantName = "DePix", merchantCity = "Brasil") {
  // Formato EMV para PIX
  const merchantAccountInfo = `0014BR.GOV.BCB.PIX01${pixKey.length}${pixKey}`;
  const transactionAmount = amount ? `5204${amount.toFixed(2).replace('.', '')}` : '';
  const merchantNameField = `5907${merchantName}`;
  const merchantCityField = `6006${merchantCity}`;
  const additionalDataField = description ? `62${(description.length + 4).toString().padStart(2, '0')}05${description}` : '';
  
  // Montagem do payload PIX
  let payload = `00020126${merchantAccountInfo.length}${merchantAccountInfo}${transactionAmount}5303986${merchantNameField}${merchantCityField}${additionalDataField}6304`;
  
  // Cálculo do CRC16 (implementação simplificada)
  const crc = calculateCRC16(payload);
  
  return payload + crc;
}

// Função para calcular o CRC16
function calculateCRC16(payload) {
  // Implementação do algoritmo CRC16-CCITT
  let crc = 0xFFFF;
  const polynomial = 0x1021;
  
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  
  return crc.toString(16).padStart(4, '0').toUpperCase();
}

// Rota para gerar um QR Code PIX
app.get("/api/generate-pix-qrcode", async (req, res) => {
  const { pix_key, amount, description, merchant_name, merchant_city } = req.query;
  
  if (!pix_key) {
    return res.status(400).json({ error: "O parâmetro 'pix_key' é obrigatório." });
  }
  
  if (!amount) {
    return res.status(400).json({ error: "O parâmetro 'amount' é obrigatório." });
  }
  
  try {
    // Gerar o payload PIX
    const pixPayload = generatePixPayload(
      pix_key,
      parseFloat(amount),
      description || `Compra de ${amount} DePix`,
      merchant_name || "DePix",
      merchant_city || "Brasil"
    );
    
    // Gerar o QR Code
    const qrCodeDataURL = await qrcode.toDataURL(pixPayload, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 300
    });
    
    // Gerar a URI de pagamento PIX
    const paymentUri = `pix://${pix_key}?amount=${amount}&description=${encodeURIComponent(description || `Compra de ${amount} DePix`)}`;
    
    res.json({
      qr_code_data_url: qrCodeDataURL,
      pix_code: pixPayload,
      payment_uri: paymentUri
    });
  } catch (error) {
    console.error("Erro ao gerar QR Code PIX:", error);
    res.status(500).json({ error: "Falha ao gerar QR Code PIX", details: error.message });
  }
});
// Rota para verificar o status do servidor

app.get("/", (req, res) => {
  res.send("Servidor DePix-Bridge está no ar!");
});

app.listen(port, () => {
  console.log(`Servidor DePix-Bridge rodando na porta ${port}`);
});

//Adiciona endpoint para geração de QR Code PIX
