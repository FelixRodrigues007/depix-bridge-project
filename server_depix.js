/**
 * DePix-Bridge • Node/Express
 *  ↳ Gera payload EMV-QR (Pix) DINÂMICO com valor fixo
 *  ↳ Retorna QR Code base64 + código “copia-e-cola”
 *  ↳ Cria endereço Liquid P2WPKH para receber DePix
 *  ▸ Deploy-ready para Render
 */

const express = require("express");
const qrcode  = require("qrcode");

const { payments, networks } = require("liquidjs-lib");
const ecc            = require("tiny-secp256k1");
const ECPairFactory  = require("ecpair").ECPairFactory;
const ECPair         = ECPairFactory(ecc);

/* ───────────────────── Config ───────────────────── */
const app  = express();
const port = process.env.PORT || 10000;
app.use(express.json());

/* ─────────────── Dados do ativo DePix ───────────── */
const DEPIX_ASSET_ID  = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";
const DEPIX_NAME      = "Decentralized Pix";
const DEPIX_TICKER    = "DePix";
const DEPIX_PRECISION = 8;
const EXPLORER        = "https://blockstream.info/liquid/asset/";

/* ───────────── TLV helper (tag-length-value) ─────── */
const tlv = (tag, value = "") =>
  `${tag}${value.length.toString().padStart(2, "0")}${value}`;

/* ───────────── CRC16-CCITT (0x1021) ──────────────── */
function calculateCRC16(payload) {
  let crc = 0xffff, poly = 0x1021;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++)
      crc = crc & 0x8000 ? ((crc << 1) ^ poly) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/* ─────── Gera payload EMV-QR (Pix dinâmico) ─────── */
function generatePixPayload(
  pixKey,
  amount,
  description = "",
  merchantName = "DEPX",
  merchantCity = "BRASIL"
) {
  /* Sub-template 26 — Merchant Account Info */
  const merchantAccountInfo =
      tlv("00", "BR.GOV.BCB.PIX") +
      tlv("01", pixKey);

  /* Additional Data (Tag 62) — TxID opcional */
  const addData = description
      ? tlv("62", tlv("05", description))
      : "";

  /* Payload raiz */
  let payload =
      tlv("00", "01") +          // Payload Format Indicator
      tlv("01", "12") +          // **QR dinâmico (valor obrigatório)**
      tlv("26", merchantAccountInfo) +
      tlv("52", "0000") +        // MCC
      tlv("53", "986") +         // Moeda: BRL
      tlv("54", amount.toFixed(2)) + // Valor fixo
      tlv("58", "BR") +
      tlv("59", merchantName.toUpperCase().slice(0, 25)) +
      tlv("60", merchantCity.toUpperCase().slice(0, 15)) +
      addData +
      "6304";                   // Placeholder CRC

  return payload + calculateCRC16(payload);
}

/* ─────────────────────── Rotas ───────────────────── */

/* Health-check */
app.get("/", (_req, res) => res.send("Servidor DePix-Bridge ativo!"));

/* Info do ativo */
app.get("/api/depix-info", (_req, res) => {
  res.json({
    asset_id: DEPIX_ASSET_ID,
    name: DEPIX_NAME,
    ticker: DEPIX_TICKER,
    precision: DEPIX_PRECISION,
    explorer_link: `${EXPLORER}${DEPIX_ASSET_ID}`,
  });
});

/* Novo endereço P2WPKH (Liquid) */
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

/* Gera QR Code Pix */
app.get("/api/generate-pix-qrcode", async (req, res) => {
  const { pix_key, amount, description, merchant_name, merchant_city } = req.query;

  if (!pix_key) return res.status(400).json({ error: "O parâmetro 'pix_key' é obrigatório." });
  if (!amount)  return res.status(400).json({ error: "O parâmetro 'amount' é obrigatório." });

  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0)
    return res.status(400).json({ error: "Valor 'amount' inválido." });

  try {
    const pixPayload = generatePixPayload(
      pix_key,
      value,
      description   || `Compra DePIX #${Date.now()}`,
      merchant_name || "DePix",
      merchant_city || "Brasil"
    );

    const qr_code_data_url = await qrcode.toDataURL(pixPayload, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 300,
    });

    const payment_uri =
      `pix://${encodeURIComponent(pix_key)}?amount=${value.toFixed(2)}` +
      `&description=${encodeURIComponent(description || "Compra DePIX")}`;

    res.json({ qr_code_data_url, pix_code: pixPayload, payment_uri });
  } catch (err) {
    res.status(500).json({ error: "Falha ao gerar QR Code", details: err.message });
  }
});

/* ─────────────────── Inicia servidor ─────────────── */
app.listen(port, () => console.log(`DePix-Bridge rodando na porta ${port}`));
