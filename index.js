const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "one-piece-tcg-prices.p.rapidapi.com";

// CORS headers on every request
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Serve the frontend app
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/cards", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `https://${RAPIDAPI_HOST}/cards?${params}`;
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/episodes", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `https://${RAPIDAPI_HOST}/episodes?${params}`;
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ TCGgo proxy running on port ${PORT}`);
});
