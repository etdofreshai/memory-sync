import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getStats } from "./lib/db.js";
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

// ── API Routes ──────────────────────────────────────────────

app.get("/api/stats", async (_req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload/imessage", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const result = await syncIMessage(req.file.path);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload/whatsapp", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const chatName = (req.body as any)?.chatName || req.file.originalname;
  try {
    const result = await syncWhatsApp(req.file.path, chatName);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync/discord", async (_req, res) => {
  try {
    const { syncDiscord } = await import("./syncs/discord.js");
    const result = await syncDiscord();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync/slack", async (_req, res) => {
  try {
    const { syncSlack } = await import("./syncs/slack.js");
    const result = await syncSlack();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[memory-sync] Server running on http://localhost:${PORT}`);
});
