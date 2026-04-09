const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "one-piece-tcg-prices.p.rapidapi.com";
const SUPA_URL      = "https://qbmvilndblltfwuqovlq.supabase.co";
const SUPA_KEY      = process.env.SUPABASE_KEY;

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

// ── TCGgo: card search ────────────────────────────────────────────────────────
app.get("/cards", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    if (!params.has("per_page")) params.set("per_page", "20");
    const response = await fetch(`https://${RAPIDAPI_HOST}/cards?${params}`, {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key":  RAPIDAPI_KEY,
      },
    });
    res.json(await response.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TCGgo: episodes / sets ────────────────────────────────────────────────────
app.get("/episodes", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const response = await fetch(`https://${RAPIDAPI_HOST}/episodes?${params}`, {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key":  RAPIDAPI_KEY,
      },
    });
    res.json(await response.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TCGgo: single card price by TCGPlayer product ID ─────────────────────────
// Called by autofillTCG() in the HTML when a TCGPlayer URL is pasted.
// Hits the RapidAPI endpoint that returns pricing for a specific product ID.
// Returns: { market_price: number | null }
app.get("/cards/:id/price", async (req, res) => {
  const { id } = req.params;
  try {
    // TCGgo exposes a pricing endpoint keyed on tcgplayer_id
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/cards?tcgplayer_id=${encodeURIComponent(id)}&per_page=1`,
      {
        headers: {
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key":  RAPIDAPI_KEY,
        },
      }
    );
    const data = await response.json();
    const cards = Array.isArray(data) ? data : (data.data || []);
    const card  = cards[0];

    if (!card) return res.json({ market_price: null });

    // Normalise the price field — TCGgo uses tcg_player or tcgplayer
    const prices = card.prices?.tcgplayer || card.prices?.tcg_player;
    const market = prices?.market_price ?? null;

    res.json({ market_price: market });
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

// Load all keys at once — returns { inventory, offers, sellers, tiers, finances, custom_catalog, api_key }
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
