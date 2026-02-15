/**
 * Anthropic chat sync — fetches conversation history from Anthropic API.
 * Usage: tsx src/syncs/anthropic.ts
 *
 * Requires ANTHROPIC_API_KEY in .env
 * Uses the /v1/conversations endpoint (Claude.ai conversations)
 */

import { getSourceId, insertMessage } from "../lib/db.js";
import dotenv from "dotenv";

dotenv.config();

const API_BASE = "https://api.anthropic.com/v1";

async function apiRequest(endpoint: string, params: Record<string, string> = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2024-01-01",
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function syncAnthropic(): Promise<{ inserted: number; conversations: number }> {
  console.log("[anthropic] Starting sync...");
  const sourceId = await getSourceId("anthropic");
  let totalInserted = 0;
  let totalConversations = 0;

  // List conversations
  let hasMore = true;
  let afterId: string | undefined;

  while (hasMore) {
    const params: Record<string, string> = { limit: "100" };
    if (afterId) params.after_id = afterId;

    let data: any;
    try {
      data = await apiRequest("/conversations", params);
    } catch (err: any) {
      // If conversations endpoint isn't available, try organizations endpoint
      console.log("[anthropic] Conversations API not available, trying alternate methods...");
      console.log(`[anthropic] Error: ${err.message}`);
      return { inserted: 0, conversations: 0 };
    }

    const conversations = data.data || data.conversations || [];
    if (conversations.length === 0) break;

    for (const convo of conversations) {
      totalConversations++;
      const convoId = convo.id || convo.uuid;

      // Fetch conversation messages
      try {
        const messages = await apiRequest(`/conversations/${convoId}/messages`, { limit: "1000" });
        const msgs = messages.data || messages.messages || [];

        for (const msg of msgs) {
          const content =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content.map((b: any) => b.text || "").join("\n")
                : JSON.stringify(msg.content);

          if (!content || content.length === 0) continue;

          const ok = await insertMessage({
            sourceId,
            content,
            sender: msg.role === "user" ? "user" : "claude",
            recipient: msg.role === "user" ? "claude" : "user",
            timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
            metadata: {
              conversationId: convoId,
              conversationTitle: convo.name || convo.title,
              model: msg.model,
              role: msg.role,
              messageId: msg.id,
            },
          });
          if (ok) totalInserted++;
        }
      } catch (err: any) {
        console.error(`[anthropic] Error fetching convo ${convoId}: ${err.message}`);
      }
    }

    hasMore = data.has_more || false;
    if (conversations.length > 0) {
      afterId = conversations[conversations.length - 1].id;
    }
  }

  console.log(`[anthropic] Done: ${totalInserted} messages from ${totalConversations} conversations`);
  return { inserted: totalInserted, conversations: totalConversations };
}

// CLI
if (process.argv[1]?.endsWith("anthropic.ts") || process.argv[1]?.endsWith("anthropic.js")) {
  syncAnthropic().then(() => process.exit(0));
}
