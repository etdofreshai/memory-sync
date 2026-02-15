/**
 * Discord sync — connects via bot token, fetches message history.
 * Usage: tsx src/syncs/discord.ts
 *
 * Requires DISCORD_TOKEN and DISCORD_GUILD_IDS in .env
 */

import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { getSourceId, insertMessage, pool } from "../lib/db.js";
import dotenv from "dotenv";

dotenv.config();

const BATCH_SIZE = 100;

async function getLastTimestamp(sourceId: number, channelId: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT MAX(timestamp) as last_ts FROM messages
     WHERE source_id = $1 AND metadata->>'channelId' = $2`,
    [sourceId, channelId]
  );
  return res.rows[0]?.last_ts || null;
}

export async function syncDiscord() {
  const token = process.env.DISCORD_TOKEN;
  const guildIds = (process.env.DISCORD_GUILD_IDS || "").split(",").filter(Boolean);

  if (!token) {
    console.error("[discord] DISCORD_TOKEN not set");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await client.login(token);
  console.log(`[discord] Logged in as ${client.user?.tag}`);

  const sourceId = await getSourceId("discord");
  let totalInserted = 0;

  for (const guildId of guildIds) {
    const guild = await client.guilds.fetch(guildId);
    console.log(`[discord] Syncing guild: ${guild.name}`);

    const channels = await guild.channels.fetch();
    const textChannels = channels.filter(
      (c): c is TextChannel => c?.type === 0 // GuildText
    );

    for (const [, channel] of textChannels) {
      console.log(`[discord]   #${channel.name}...`);
      let lastId: string | undefined;
      let channelInserted = 0;

      // Fetch messages in batches
      while (true) {
        const messages = await channel.messages.fetch({
          limit: BATCH_SIZE,
          ...(lastId ? { before: lastId } : {}),
        });

        if (messages.size === 0) break;

        for (const [, msg] of messages) {
          if (!msg.content && msg.attachments.size === 0) continue;

          const content = msg.content || `[${msg.attachments.size} attachment(s)]`;
          const ok = await insertMessage({
            sourceId,
            content,
            sender: `${msg.author.username}#${msg.author.discriminator}`,
            recipient: `#${channel.name}`,
            timestamp: msg.createdAt.toISOString(),
            metadata: {
              channelId: channel.id,
              guildId: guild.id,
              authorId: msg.author.id,
              messageId: msg.id,
              hasAttachments: msg.attachments.size > 0,
            },
          });
          if (ok) channelInserted++;
        }

        lastId = messages.last()?.id;
        if (messages.size < BATCH_SIZE) break;
      }

      if (channelInserted > 0) {
        console.log(`[discord]   → ${channelInserted} new messages`);
      }
      totalInserted += channelInserted;
    }
  }

  console.log(`[discord] Done: ${totalInserted} total new messages`);
  client.destroy();
  return { inserted: totalInserted };
}

// CLI
if (process.argv[1]?.endsWith("discord.ts") || process.argv[1]?.endsWith("discord.js")) {
  syncDiscord().then(() => process.exit(0));
}
