# Memory Sync

Sync chat platforms and files to PostgreSQL. Standalone service — runs independently from OpenClaw.

## Supported Sources

| Source | Method | Status |
|--------|--------|--------|
| **iMessage** | Upload `chat.db` via web UI | ✅ Ready |
| **Discord** | Bot token, live sync | ✅ Ready |
| **Slack** | Bot token, live sync | ✅ Ready |
| **WhatsApp** | Upload chat export `.txt` | ✅ Ready |

## Setup

```bash
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

Open `http://localhost:3500` for the web UI.

## CLI Usage

```bash
# Upload iMessage database
npm run sync:imessage -- path/to/chat.db

# Sync Discord channels
npm run sync:discord

# Sync Slack channels
npm run sync:slack

# Upload WhatsApp export
npm run sync:whatsapp -- path/to/chat.txt "Chat Name"
```

## API

- `GET /api/stats` — Database statistics
- `POST /api/upload/imessage` — Upload chat.db (multipart)
- `POST /api/upload/whatsapp` — Upload chat export (multipart)
- `POST /api/sync/discord` — Trigger Discord sync
- `POST /api/sync/slack` — Trigger Slack sync
