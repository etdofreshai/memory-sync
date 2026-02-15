import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getStats } from "./lib/db.js";
import { getSyncStatus, withTracking } from "./lib/sync-state.js";
import { syncIMessage } from "./syncs/imessage.js";
import { syncWhatsApp } from "./syncs/whatsapp.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "3500");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");

const upload = multer({ dest: UPLOAD_DIR });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Stats ───────────────────────────────────────────────────

app.get("/api/stats", async (_req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sync Status ─────────────────────────────────────────────

app.get("/api/sync/status", async (_req, res) => {
  try {
    const statuses = await getSyncStatus();
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sync/status/:service", async (req, res) => {
  try {
    const statuses = await getSyncStatus(req.params.service);
    res.json(statuses[0] || { service: req.params.service, last_status: "never" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── File Uploads ────────────────────────────────────────────

app.post("/api/upload/imessage", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const tracked = withTracking("imessage", () => syncIMessage(req.file!.path));
    const result = await tracked();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload/whatsapp", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const chatName = (req.body as any)?.chatName || req.file.originalname;
  try {
    const tracked = withTracking("whatsapp", () => syncWhatsApp(req.file!.path, chatName));
    const result = await tracked();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Live Syncs ──────────────────────────────────────────────

app.post("/api/sync/:service", async (req, res) => {
  const service = req.params.service;
  const allowed = ["discord", "slack", "anthropic", "openai"];

  if (!allowed.includes(service)) {
    return res.status(400).json({ error: `Unknown service: ${service}. Allowed: ${allowed.join(", ")}` });
  }

  try {
    const mod = await import(`./syncs/${service}.js`);
    const syncFn = mod[`sync${service.charAt(0).toUpperCase() + service.slice(1)}`];
    if (!syncFn) return res.status(500).json({ error: `No sync function found for ${service}` });

    const tracked = withTracking(service, syncFn);
    const result = await tracked();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[memory-sync] Server running on http://localhost:${PORT}`);
  console.log(`[memory-sync] Services: imessage, discord, slack, whatsapp, anthropic, openai`);
});
