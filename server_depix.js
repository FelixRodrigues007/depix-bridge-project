/**
 * DePix-Bridge – Node/Express server
 * 1. Gera endereço Liquid (P2WPKH) para receber DePix
 * 2. Gera payload EMV-QR (Pix) + QR Code base64 com valor fixo
 *
 * Deploy-ready para Render.com
 */

const express = require("express");
const qrcode  = require("qrcode");

// -------- Liquid (endereço P2WPKH) ------------------------------
const { payments, networks } = require("liquidjs-lib");
const ecc            = require("tiny-secp256k1");
const ECPairFactory  = require("ecpair").ECPairFactory;
const ECPair         = ECPairFactory(ecc);

// -------- Config ------------------------------------------------
const app  = express();
const port = process.env.PORT || 10000;          // Render injeta $PORT
app.use(express.json());

// ---- Metadados do ativo DePix ----------------------------------
const DEPIX_ASSET_ID  = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";
const DEPIX_NAME      = "Decentralized Pix";
const DEPIX_TICKER    = "DePix";
const DEPIX_PRECISION = 8;
const EXPLORER        = "https://blockstream.info/liquid/asset/";

// ----------------------------------------------------------------
// Utilitário TLV (tag-length-value)
const tlv = (tag, value = "") =>
  `${tag}${value.length.toString().padStart(2, "0")}${value}`;

// ---------- CRC16-CCITT (polinômio 0x1021) ----------------------
function calculateCRC16(payload) {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000
        ? ((crc << 1) ^ polynomial) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ---------- Payload EMV-QR para Pix -----------------------------
function generatePixPayload(
  pixKey,
  amount,
  description = "",
  merchantName = "DEPX",
  merchantCity = "BRASIL"
) {
  // Sub-template 26 – Merchant Account Information
  const merchantAccountInfo =
      tlv("00", "BR.GOV.BCB.PIX") +
      tlv("01", pixKey);

  // Additional Data (Tag 62) – TxID
  const addData =
      description ? tlv("62", tlv("05", description)) : "";

  let payload =
      tlv("00", "01") +                    // Payload Format Indicator
      tlv("26", merchantAccountInfo) +     // Merchant Account Info
      tlv("52", "0000") +                  // MCC
      tlv("53", "986") +                   // Currency – BRL
      tlv("54", amount.toFixed(2)) +       // Valor fixo
      tlv("58", "BR") +                    // País
      tlv("59", merchantName.toUpperCase().slice(0, 25)) +
      tlv("60", merchantCity.toUpperCase().slice(0, 15)) +
      addData +
      "6304";                              // CRC placeholder

  return payload + calculateCRC16(payload);
}

// ----------------------------------------------------------------
// Rotas
// ----------------------------------------------------------------

// Health-check
app.get("/", (_req, res) => res.send("Servidor DePix-Bridge ativo!"));

// Dados públicos do ativo
app.get("/api/depix-info", (_req, res) => {
  res.json({
    asset_id: DEPIX_ASSET_ID,
    name: DEPIX_NAME,
    ticker: DEPIX_TICKER,
    precision: DEPIX_PRECISION,
    explorer_link: `${EXPLORER}${DEPIX_ASSET_ID}`,
  });
});

// Gera novo endereço P2WPKH na Liquid
app.get("/api/generate-depix-address", (_req, res) => {
  try {
    const keyPair      = ECPair.makeRandom();
    const { address }  = payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: networks.liquid,
    });

    res.json({ address });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao gerar endereço Liquid", details: err.message });
  }
});

// Gera QR Code Pix (valor em BRL → mintagem 1 DePix)
app.get("/api/generate-pix-qrcode", async (req, res) => {
  const { pix_key, amount, description, merchant_name, merchant_city } = req.query;

  if (!pix_key)  return res.status(400).json({ error: "O parâmetro 'pix_key' é obrigatório." });
  if (!amount)   return res.status(400).json({ error: "O parâmetro 'amount' é obrigatório." });

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

    const payment_uri = `pix://${encodeURIComponent(pix_key)}?amount=${value.toFixed(
      2
    )}&description=${encodeURIComponent(description || "Compra DePIX")}`;

    res.json({ qr_code_data_url, pix_code: pixPayload, payment_uri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao gerar QR Code PIX", details: err.message });
  }
});

// ----------------------------------------------------------------
app.listen(port, () => console.log(`DePix-Bridge rodando na porta ${port}`));
