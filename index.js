const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "one-piece-tcg-prices.p.rapidapi.com";
const OPTCG_BASE = "https://optcgapi.com/api";
const SUPA_URL = "https://qbmvilndblltfwuqovlq.supabase.co";
const SUPA_KEY = process.env.SUPABASE_KEY;

app.use(express.json({ limit: "10mb" }));

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── TCGgo ─────────────────────────────────────────────────────────────────────
app.get("/cards", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    if (!params.has("per_page")) params.set("per_page", "20");
    const response = await fetch(`https://${RAPIDAPI_HOST}/cards?${params}`, {
      headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY }
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/episodes", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const response = await fetch(`https://${RAPIDAPI_HOST}/episodes?${params}`, {
      headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY }
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OPTCG API ─────────────────────────────────────────────────────────────────
app.get("/optcg/search", async (req, res) => {
  const query = (req.query.q || "").toLowerCase().trim();
  if (!query) return res.json({ results: [] });
  try {
    const results = [];

    // Fetch each endpoint separately with individual error handling
    const endpoints = [
      { url: `${OPTCG_BASE}/sets/filtered/?card_name=${encodeURIComponent(query)}`, source: "Set Card" },
      { url: `${OPTCG_BASE}/decks/filtered/?card_name=${encodeURIComponent(query)}`, source: "Starter Deck" },
      { url: `${OPTCG_BASE}/promos/filtered/?card_name=${encodeURIComponent(query)}`, source: "Promo" }
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(endpoint.url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!r.ok) continue;
        const text = await r.text();
        if (!text || text.trim() === '') continue;
        let data;
        try { data = JSON.parse(text); } catch { continue; }
        if (!Array.isArray(data)) continue;
        data.forEach(card => {
          results.push({
            id: card.card_id || card.id || '',
            name: card.card_name || card.name || '',
            card_number: card.card_id || card.card_number || '',
            set_name: card.set_name || card.deck_name || endpoint.source,
            image: card.card_image || card.image || null,
            rarity: card.rarity || '',
            color: card.color || '',
            tcgplayer_market_price: parseFloat(card.market_price) || null,
            tcgplayer_low_price: parseFloat(card.low_price) || null,
            tcgplayer_mid_price: parseFloat(card.mid_price) || null,
            tcgplayer_id: card.tcgplayer_id || null,
            source: "optcg"
          });
        });
      } catch (endpointErr) {
        console.warn('OPTCG endpoint failed:', endpoint.source, endpointErr.message);
        continue;
      }
    }

    res.json({ results });
  } catch (e) {
    console.error('OPTCG search error:', e.message);
    res.json({ results: [], error: e.message });
  }
});

app.get("/optcg/card/:cardId", async (req, res) => {
  const cardId = req.params.cardId;
  try {
    const [setRes, deckRes] = await Promise.all([
      fetch(`${OPTCG_BASE}/sets/card/${cardId}/`),
      fetch(`${OPTCG_BASE}/decks/card/${cardId}/`)
    ]);
    let data = null;
    if (setRes.ok) data = await setRes.json().catch(() => null);
    if (!data && deckRes.ok) data = await deckRes.json().catch(() => null);
    if (!data) return res.status(404).json({ error: "Card not found" });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUPABASE ──────────────────────────────────────────────────────────────────
const supaHeaders = () => ({
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "resolution=merge-duplicates"
});

app.get("/db/load", async (req, res) => {
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/app_data?select=key,value`, {
      headers: supaHeaders()
    });
    const rows = await response.json();
    if (!Array.isArray(rows)) return res.status(500).json({ error: "Load failed", raw: rows });
    const data = {};
    rows.forEach(r => { data[r.key] = r.value; });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/db/save", async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Missing key" });
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/app_data`, {
      method: "POST",
      headers: supaHeaders(),
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`✅ Proxy running on port ${PORT}`));
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "one-piece-tcg-prices.p.rapidapi.com";
const OPTCG_BASE = "https://optcgapi.com/api";
const SUPA_URL = "https://qbmvilndblltfwuqovlq.supabase.co";
const SUPA_KEY = process.env.SUPABASE_KEY;

app.use(express.json({ limit: "10mb" }));

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── TCGgo ────────────────────────────────────────────────────────────────────
app.get("/cards", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    if (!params.has("per_page")) params.set("per_page", "20");
    const response = await fetch(`https://${RAPIDAPI_HOST}/cards?${params}`, {
      headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY }
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/episodes", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const response = await fetch(`https://${RAPIDAPI_HOST}/episodes?${params}`, {
      headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY }
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OPTCG API ────────────────────────────────────────────────────────────────
app.get("/optcg/search", async (req, res) => {
  const query = (req.query.q || "").toLowerCase().trim();
  if (!query) return res.json({ results: [] });
  try {
    const [setsRes, stRes, promoRes] = await Promise.all([
      fetch(`${OPTCG_BASE}/sets/filtered/?card_name=${encodeURIComponent(query)}`),
      fetch(`${OPTCG_BASE}/decks/filtered/?card_name=${encodeURIComponent(query)}`),
      fetch(`${OPTCG_BASE}/promos/filtered/?card_name=${encodeURIComponent(query)}`)
    ]);
    const [setsData, stData, promoData] = await Promise.all([
      setsRes.json().catch(() => []),
      stRes.json().catch(() => []),
      promoRes.json().catch(() => [])
    ]);
    const normalize = (card, source) => ({
      id: card.card_id || card.id,
      name: card.card_name || card.name,
      card_number: card.card_id || card.card_number || "",
      set: card.set_id || card.deck_id || card.promo_id || "",
      set_name: card.set_name || card.deck_name || source,
      image: card.card_image || card.image || null,
      rarity: card.rarity || "",
      color: card.color || "",
      tcgplayer_market_price: card.market_price || null,
      tcgplayer_low_price: card.low_price || null,
      tcgplayer_mid_price: card.mid_price || null,
      tcgplayer_id: card.tcgplayer_id || null,
      source: "optcg"
    });
    const results = [
      ...(Array.isArray(setsData) ? setsData : []).map(c => normalize(c, "Set Card")),
      ...(Array.isArray(stData) ? stData : []).map(c => normalize(c, "Starter Deck")),
      ...(Array.isArray(promoData) ? promoData : []).map(c => normalize(c, "Promo"))
    ];
    res.json({ results });
  } catch (e) { res.status(500).json({ error: e.message, results: [] }); }
});

app.get("/optcg/card/:cardId", async (req, res) => {
  const cardId = req.params.cardId;
  try {
    const [setRes, deckRes] = await Promise.all([
      fetch(`${OPTCG_BASE}/sets/card/${cardId}/`),
      fetch(`${OPTCG_BASE}/decks/card/${cardId}/`)
    ]);
    let data = null;
    if (setRes.ok) data = await setRes.json().catch(() => null);
    if (!data && deckRes.ok) data = await deckRes.json().catch(() => null);
    if (!data) return res.status(404).json({ error: "Card not found" });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUPABASE SYNC ────────────────────────────────────────────────────────────
const supaHeaders = () => ({
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "resolution=merge-duplicates"
});

// Load all data
app.get("/db/load", async (req, res) => {
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/app_data?select=key,value`, {
      headers: supaHeaders()
    });
    const rows = await response.json();
    if (!Array.isArray(rows)) return res.status(500).json({ error: "Load failed", raw: rows });
    const data = {};
    rows.forEach(r => { data[r.key] = r.value; });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save a single key
app.post("/db/save", async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Missing key" });
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/app_data`, {
      method: "POST",
      headers: { ...supaHeaders(), "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save all data at once (bulk)
app.post("/db/save-all", async (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "Expected array" });
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/app_data`, {
      method: "POST",
      headers: { ...supaHeaders(), "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(rows.map(r => ({ ...r, updated_at: new Date().toISOString() })))
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`✅ Proxy running on port ${PORT}`));
