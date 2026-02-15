# Memory Sync

Sync chat platforms and files to PostgreSQL. Standalone service — runs independently from OpenClaw.

## Supported Sources

| Source | Method | Status |
|--------|--------|--------|
| **iMessage** | Upload `chat.db` via web UI | ✅ Ready |
| **Discord** | Bot token, live sync | ✅ Ready |
| **Slack** | Bot token, live sync | ✅ Ready |
| **WhatsApp** | Upload chat export `.txt` | ✅ Ready |
| **Anthropic** | API key, live sync | ✅ Ready |
| **OpenAI** | API key, live sync | ✅ Ready |

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

# Sync Anthropic conversations
npm run sync:anthropic

# Sync OpenAI conversations
npm run sync:openai
```

## API

### Stats & Status
- `GET /api/stats` — Database statistics by source
- `GET /api/sync/status` — All services sync status (last sync, inserted count, errors)
- `GET /api/sync/status/:service` — Single service status

### File Uploads
- `POST /api/upload/imessage` — Upload chat.db (multipart)
- `POST /api/upload/whatsapp` — Upload chat export (multipart, optional `chatName` field)

### Trigger Syncs
- `POST /api/sync/discord` — Trigger Discord sync
- `POST /api/sync/slack` — Trigger Slack sync
- `POST /api/sync/anthropic` — Trigger Anthropic sync
- `POST /api/sync/openai` — Trigger OpenAI sync

Each sync tracks state in PostgreSQL (`sync_state` table): last sync time, status, inserted count, errors, total synced, and running state.
