const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

const SUPA_URL = "https://qbmvilndblltfwuqovlq.supabase.co";
const SUPA_KEY = process.env.SUPABASE_KEY;

app.use(express.json({ limit: "10mb" }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── TCGPlayer card scrape by product ID ───────────────────────────────────────
// Fetches the TCGPlayer product page and extracts card metadata from meta tags.
// Returns: { name, image, market_price, number, set }
app.get("/cards/:id/price", async (req, res) => {
  const { id } = req.params;
  const url = `https://www.tcgplayer.com/product/${id}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) return res.json({ market_price: null });
    const html = await response.text();

    // Extract from meta tags
    const getMeta = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
               || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
      return m ? m[1] : null;
    };

    // og:image is the card image
    const image = getMeta('og:image');
    // og:title is usually "Card Name | TCGPlayer"
    const ogTitle = getMeta('og:title') || '';
    const name = ogTitle.replace(/\s*\|.*$/, '').trim() || null;

    // Try to extract price from JSON-LD or page data
    let market_price = null;
    const priceMatch = html.match(/"lowPrice"\s*:\s*"?([\d.]+)"?/)
                    || html.match(/"price"\s*:\s*"?([\d.]+)"?/)
                    || html.match(/market[_\s]price['":\s]+([\d.]+)/i);
    if (priceMatch) market_price = parseFloat(priceMatch[1]);

    // Extract card number from page content
    let number = null;
    const numMatch = html.match(/Card Number[^\w]*([A-Z0-9]{2,}-\d{3})/i)
                  || html.match(/([A-Z0-9]{2,3}\d{2}-\d{3}[A-Z]?)/);
    if (numMatch) number = numMatch[1];

    res.json({ name, image, market_price, number, url });
  } catch (e) {
    res.status(500).json({ error: e.message, market_price: null });
  }
});

// ── Supabase helpers ──────────────────────────────────────────────────────────
const supaHeaders = () => ({
  "Content-Type":  "application/json",
  "apikey":        SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer":        "resolution=merge-duplicates",
});

// Load all keys at once
app.get("/db/load", async (req, res) => {
  try {
    const response = await fetch(
      `${SUPA_URL}/rest/v1/app_data?select=key,value`,
      { headers: supaHeaders() }
    );
    const rows = await response.json();
    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: "Load failed", raw: rows });
    }
    const data = {};
    rows.forEach((r) => { data[r.key] = r.value; });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save a single key/value pair (upsert)
app.post("/db/save", async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Missing key" });
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/app_data`, {
      method:  "POST",
      headers: supaHeaders(),
      body:    JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Proxy running on port ${PORT}`));
