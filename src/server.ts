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
const PORT = parseInt(process.env.PORT || "3001");
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

// ── Messages ────────────────────────────────────────────────

app.get("/api/messages", async (req, res) => {
  try {
    const { search, source, sender, recipient, limit = "50", offset = "0" } = req.query;
    let query = `
      SELECT m.id, m.content, m.sender, m.recipient, m.timestamp, m.metadata, s.name as source
      FROM messages m
      JOIN sources s ON m.source_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND m.content ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }
    if (source) {
      query += ` AND s.name = $${paramIndex++}`;
      params.push(source);
    }
    if (sender) {
      query += ` AND m.sender ILIKE $${paramIndex++}`;
      params.push(`%${sender}%`);
    }
    if (recipient) {
      query += ` AND m.recipient ILIKE $${paramIndex++}`;
      params.push(`%${recipient}%`);
    }

    query += ` ORDER BY m.timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { pool } = await import("./lib/db.js");
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Contacts ────────────────────────────────────────────────

app.get("/api/contacts", async (req, res) => {
  try {
    const { search } = req.query;
    const { pool } = await import("./lib/db.js");
    let query = "SELECT * FROM contacts";
    const params: any[] = [];

    if (search) {
      query += " WHERE name ILIKE $1 OR aliases::text ILIKE $1";
      params.push(`%${search}%`);
    }

    query += " ORDER BY name";
    const result = await pool.query(query, params);
    res.json(result.rows);
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

app.post("/api/upload/openai", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fs = await import("fs/promises");
    const { getSourceId, insertMessage } = await import("./lib/db.js");
    
    const content = await fs.readFile(req.file.path, "utf-8");
    const data = JSON.parse(content);
    
    const sourceId = await getSourceId("openai");
    let imported = 0;
    let conversations = 0;
    
    // Handle OpenAI export format (array of conversations)
    const convos = Array.isArray(data) ? data : [data];
    
    for (const convo of convos) {
      conversations++;
      const mapping = convo.mapping || {};
      
      for (const [, node] of Object.entries<any>(mapping)) {
        const msg = node?.message;
        if (!msg || !msg.content?.parts) continue;
        
        const text = msg.content.parts
          .filter((p: any) => typeof p === "string")
          .join("\n");
        
        if (!text) continue;
        
        const role = msg.author?.role || "unknown";
        const ok = await insertMessage({
          sourceId,
          content: text,
          sender: role === "user" ? "user" : "assistant",
          recipient: role === "user" ? "assistant" : "user",
          timestamp: msg.create_time
            ? new Date(msg.create_time * 1000).toISOString()
            : new Date().toISOString(),
          metadata: {
            conversationId: convo.id,
            conversationTitle: convo.title,
            model: msg.metadata?.model_slug,
          },
        });
        if (ok) imported++;
      }
    }
    
    res.json({ ok: true, imported, conversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload/anthropic", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fs = await import("fs/promises");
    const { getSourceId, insertMessage } = await import("./lib/db.js");
    
    const content = await fs.readFile(req.file.path, "utf-8");
    const data = JSON.parse(content);
    
    const sourceId = await getSourceId("anthropic");
    let imported = 0;
    let conversations = 0;
    
    // Handle Anthropic export format
    const convos = Array.isArray(data) ? data : [data];
    
    for (const convo of convos) {
      conversations++;
      const messages = convo.messages || convo.chat_messages || [];
      
      for (const msg of messages) {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.map((b: any) => b.text || b.content || "").join("\n")
              : msg.text || "";
        
        if (!text) continue;
        
        const ok = await insertMessage({
          sourceId,
          content: text,
          sender: msg.role === "user" ? "user" : "assistant",
          recipient: msg.role === "user" ? "assistant" : "user",
          timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
          metadata: {
            conversationId: convo.id || convo.uuid,
            conversationTitle: convo.name || convo.title,
            model: msg.model,
          },
        });
        if (ok) imported++;
      }
    }
    
    res.json({ ok: true, imported, conversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload/generic", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(req.file.path, "utf-8");
    const data = JSON.parse(content);
    
    const { getSourceId, insertMessage } = await import("./lib/db.js");
    const sourceId = await getSourceId("import");
    
    let imported = 0;
    if (Array.isArray(data)) {
      for (const msg of data) {
        const ok = await insertMessage({
          sourceId,
          content: msg.content || msg.message || msg.text || "",
          sender: msg.sender || msg.from || "unknown",
          recipient: msg.recipient || msg.to || "unknown",
          timestamp: msg.timestamp || msg.date || new Date().toISOString(),
          metadata: msg.metadata || {},
        });
        if (ok) imported++;
      }
    }
    
    res.json({ ok: true, imported });
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
