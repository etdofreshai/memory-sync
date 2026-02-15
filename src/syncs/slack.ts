/**
 * Slack sync — fetches conversation history via Slack Web API.
 * Usage: tsx src/syncs/slack.ts
 *
 * Requires SLACK_TOKEN and SLACK_CHANNELS in .env
 * Token needs: channels:history, channels:read, users:read scopes
 */

import { WebClient } from "@slack/web-api";
import { getSourceId, insertMessage, pool } from "../lib/db.js";
import dotenv from "dotenv";

dotenv.config();

const userCache = new Map<string, string>();

async function getUsername(client: WebClient, userId: string): Promise<string> {
  if (userCache.has(userId)) return userCache.get(userId)!;
  try {
    const res = await client.users.info({ user: userId });
    const name = res.user?.real_name || res.user?.name || userId;
    userCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

async function getLastTimestamp(sourceId: number, channelId: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT MAX(metadata->>'ts') as last_ts FROM messages
     WHERE source_id = $1 AND metadata->>'channelId' = $2`,
    [sourceId, channelId]
  );
  return res.rows[0]?.last_ts || null;
}

export async function syncSlack() {
  const token = process.env.SLACK_TOKEN;
  const channelIds = (process.env.SLACK_CHANNELS || "").split(",").filter(Boolean);

  if (!token) {
    console.error("[slack] SLACK_TOKEN not set");
    process.exit(1);
  }

  const client = new WebClient(token);
  const sourceId = await getSourceId("slack");
  let totalInserted = 0;

  // If no channels specified, list all
  if (channelIds.length === 0) {
    console.log("[slack] No SLACK_CHANNELS set, listing available:");
    const res = await client.conversations.list({ types: "public_channel,private_channel" });
    for (const ch of res.channels || []) {
      console.log(`  ${ch.id} — #${ch.name}`);
    }
    return { inserted: 0 };
  }

  for (const channelId of channelIds) {
    const channelInfo = await client.conversations.info({ channel: channelId });
    const channelName = channelInfo.channel?.name || channelId;
    console.log(`[slack] Syncing #${channelName}...`);

    const lastTs = await getLastTimestamp(sourceId, channelId);
    let cursor: string | undefined;
    let channelInserted = 0;

    while (true) {
      const res = await client.conversations.history({
        channel: channelId,
        limit: 200,
        ...(cursor ? { cursor } : {}),
        ...(lastTs ? { oldest: lastTs } : {}),
      });

      for (const msg of res.messages || []) {
        if (!msg.text || msg.subtype === "channel_join") continue;

        const sender = await getUsername(client, msg.user || "unknown");
        const timestamp = new Date(parseFloat(msg.ts || "0") * 1000).toISOString();

        const ok = await insertMessage({
          sourceId,
          content: msg.text,
          sender,
          recipient: `#${channelName}`,
          timestamp,
          metadata: {
            channelId,
            ts: msg.ts,
            userId: msg.user,
            threadTs: msg.thread_ts,
          },
        });
        if (ok) channelInserted++;
      }

      if (!res.has_more || !res.response_metadata?.next_cursor) break;
      cursor = res.response_metadata.next_cursor;
    }

    if (channelInserted > 0) {
      console.log(`[slack]   → ${channelInserted} new messages`);
    }
    totalInserted += channelInserted;
  }

  console.log(`[slack] Done: ${totalInserted} total new messages`);
  return { inserted: totalInserted };
}

// CLI
if (process.argv[1]?.endsWith("slack.ts") || process.argv[1]?.endsWith("slack.js")) {
  syncSlack().then(() => process.exit(0));
}
