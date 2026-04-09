const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "one-piece-tcg-prices.p.rapidapi.com";
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
