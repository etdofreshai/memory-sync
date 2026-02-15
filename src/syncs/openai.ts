/**
 * OpenAI chat sync — fetches conversation history from OpenAI API.
 * Usage: tsx src/syncs/openai.ts
 *
 * Requires OPENAI_API_KEY in .env
 * Uses the conversations/chat completions history endpoints
 */

import { getSourceId, insertMessage } from "../lib/db.js";
import dotenv from "dotenv";

dotenv.config();

const API_BASE = "https://api.openai.com/v1";

async function apiRequest(endpoint: string, params: Record<string, string> = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function syncOpenAI(): Promise<{ inserted: number; conversations: number }> {
  console.log("[openai] Starting sync...");
  const sourceId = await getSourceId("openai");
  let totalInserted = 0;
  let totalConversations = 0;

  // Try the conversations endpoint (ChatGPT history)
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore) {
    let data: any;
    try {
      data = await apiRequest("/conversations", {
        offset: String(offset),
        limit: String(limit),
      });
    } catch (err: any) {
      // Conversations API may not be available for all account types
      console.log("[openai] Conversations API not available, trying alternate methods...");
      console.log(`[openai] Error: ${err.message}`);

      // Try fetching from ChatGPT's backend API
      try {
        data = await fetchChatGPTConversations(offset, limit);
      } catch {
        console.log("[openai] ChatGPT backend also unavailable.");
        return { inserted: 0, conversations: 0 };
      }
    }

    const conversations = data.items || data.data || [];
    if (conversations.length === 0) break;

    for (const convo of conversations) {
      totalConversations++;
      const convoId = convo.id;

      try {
        const convoData = await apiRequest(`/conversations/${convoId}`);
        const mapping = convoData.mapping || {};

        for (const [, node] of Object.entries<any>(mapping)) {
          const msg = node?.message;
          if (!msg || !msg.content?.parts) continue;

          const content = msg.content.parts
            .filter((p: any) => typeof p === "string")
            .join("\n");

          if (!content || content.length === 0) continue;

          const role = msg.author?.role || "unknown";
          const ok = await insertMessage({
            sourceId,
            content,
            sender: role === "user" ? "user" : "chatgpt",
            recipient: role === "user" ? "chatgpt" : "user",
            timestamp: msg.create_time
              ? new Date(msg.create_time * 1000).toISOString()
              : convo.create_time
                ? new Date(convo.create_time * 1000).toISOString()
                : new Date().toISOString(),
            metadata: {
              conversationId: convoId,
              conversationTitle: convo.title,
              model: msg.metadata?.model_slug,
              role,
              messageId: msg.id,
            },
          });
          if (ok) totalInserted++;
        }
      } catch (err: any) {
        console.error(`[openai] Error fetching convo ${convoId}: ${err.message}`);
      }
    }

    offset += conversations.length;
    hasMore = conversations.length >= limit;
  }

  console.log(`[openai] Done: ${totalInserted} messages from ${totalConversations} conversations`);
  return { inserted: totalInserted, conversations: totalConversations };
}

async function fetchChatGPTConversations(offset: number, limit: number) {
  const key = process.env.OPENAI_SESSION_TOKEN || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("No OpenAI token available");

  const res = await fetch(
    `https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`ChatGPT API ${res.status}`);
  return res.json();
}

// CLI
if (process.argv[1]?.endsWith("openai.ts") || process.argv[1]?.endsWith("openai.js")) {
  syncOpenAI().then(() => process.exit(0));
}
