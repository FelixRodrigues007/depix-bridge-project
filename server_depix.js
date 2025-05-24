/**
 * DePix-Bridge – servidor Node/Express
 *  • Gera Pix QR (dinâmico) com valor fixo
 *  • Devolve código “copia-e-cola”, data-URL base64 e link PNG
 *  • Cria endereço Liquid P2WPKH
 */

const express = require("express");
const qrcode  = require("qrcode");
const { payments, networks } = require("liquidjs-lib");
const ecc           = require("tiny-secp256k1");
const ECPairFactory = require("ecpair").ECPairFactory;
const ECPair        = ECPairFactory(ecc);

/* ─────────── Config ─────────── */
const app  = express();
const port = process.env.PORT || 10000;
app.use(express.json());

/* ───── Dados do token DePix ───── */
const DEPIX_ASSET_ID  = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";
const DEPIX_NAME      = "Decentralized Pix";
const DEPIX_TICKER    = "DePix";
const DEPIX_PRECISION = 8;
const EXPLORER        = "https://blockstream.info/liquid/asset/";

/* ───── util TLV ───── */
const tlv = (tag, value = "") =>
  `${tag}${value.length.toString().padStart(2, "0")}${value}`;

/* ───── CRC16-CCITT ───── */
function crc16(payload) {
  let crc = 0xffff, poly = 0x1021;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++)
      crc = crc & 0x8000 ? ((crc << 1) ^ poly) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/* ───── Gera payload EMV-QR ───── */
function buildPixPayload(
  pixKey,
  amount,
  description = "",
  merchantName = "DEPX",
  merchantCity = "BRASIL"
) {
  const merchantInfo =
      tlv("00", "BR.GOV.BCB.PIX") +
      tlv("01", pixKey);

  const addData = description
      ? tlv("62", tlv("05", description))
      : "";

  let payload =
      tlv("00", "01") +    // Payload Format Indicator
      tlv("01", "12") +    // QR dinâmico (valor obrigatório)
      tlv("26", merchantInfo) +
      tlv("52", "0000") +
      tlv("53", "986") +
      tlv("54", amount.toFixed(2)) +
      tlv("58", "BR") +
      tlv("59", merchantName.toUpperCase().slice(0, 25)) +
      tlv("60", merchantCity.toUpperCase().slice(0, 15)) +
      addData +
      "6304";

  return payload + crc16(payload);
}

/* ─────────── Rotas ─────────── */

/* Health-check */
app.get("/", (_req, res) => res.send("Servidor DePix-Bridge ativo!"));

/* Info do token */
app.get("/api/depix-info", (_req, res) => {
  res.json({
    asset_id: DEPIX_ASSET_ID,
    name: DEPIX_NAME,
    ticker: DEPIX_TICKER,
    precision: DEPIX_PRECISION,
    explorer_link: `${EXPLORER}${DEPIX_ASSET_ID}`,
  });
});

/* Endereço Liquid */
app.get("/api/generate-depix-address", (_req, res) => {
  try {
    const keyPair     = ECPair.makeRandom();
    const { address } = payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: networks.liquid,
    });
    res.json({ address });
  } catch (err) {
    res.status(500).json({ error: "Falha ao gerar endereço", details: err.message });
  }
});

/* Gera QR + payload */
app.get("/api/generate-pix-qrcode", async (req, res) => {
  const { pix_key, amount, description, merchant_name, merchant_city } = req.query;

  if (!pix_key) return res.status(400).json({ error: "Parâmetro 'pix_key' obrigatório." });
  if (!amount)  return res.status(400).json({ error: "Parâmetro 'amount' obrigatório." });

  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0)
    return res.status(400).json({ error: "Valor 'amount' inválido." });

  try {
    const payload = buildPixPayload(
      pix_key,
      value,
      description   || `Compra DePIX #${Date.now()}`,
      merchant_name || "DePix",
      merchant_city || "Brasil"
    );

    const qrBase64 = await qrcode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 8,
      width: 512,
    });

    const qrLink =
      `${req.protocol}://${req.get("host")}/api/qr?payload=${encodeURIComponent(payload)}`;

    const paymentURI =
      `pix://${encodeURIComponent(pix_key)}?amount=${value.toFixed(2)}` +
      `&description=${encodeURIComponent(description || "Compra DePIX")}`;

    res.json({
      qr_link: qrLink,
      qr_code_data_url: qrBase64,
      pix_code: payload,
      payment_uri: paymentURI,
    });
  } catch (err) {
    res.status(500).json({ error: "Falha ao gerar QR", details: err.message });
  }
});

/* Endpoint que devolve PNG do QR */
app.get("/api/qr", async (req, res) => {
  const { payload } = req.query;
  if (!payload) return res.status(400).send("payload ausente");
  try {
    const png = await qrcode.toBuffer(payload, { margin: 8, width: 512 });
    res.type("png").send(png);
  } catch (err) {
    res.status(500).send("erro ao gerar QR");
  }
});

/* ─────────── Start ─────────── */
app.listen(port, () => console.log(`DePix-Bridge rodando na porta ${port}`));
