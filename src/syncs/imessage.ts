/**
 * iMessage sync — ingests from a chat.db SQLite export.
 * Usage: tsx src/syncs/imessage.ts <path-to-chat.db>
 *
 * The chat.db file is from macOS: ~/Library/Messages/chat.db
 * Upload it via the web UI or provide the path directly.
 */

import Database from "better-sqlite3";
import { getSourceId, insertMessage } from "../lib/db.js";

const APPLE_EPOCH = 978307200; // 2001-01-01 in unix seconds

function cocoaToISO(cocoaTimestamp: number): string {
  // chat.db timestamps can be in seconds or nanoseconds from Apple epoch
  const seconds =
    cocoaTimestamp > 1e15
      ? cocoaTimestamp / 1e9
      : cocoaTimestamp > 1e12
        ? cocoaTimestamp / 1e6
        : cocoaTimestamp;
  const unix = seconds + APPLE_EPOCH;
  return new Date(unix * 1000).toISOString();
}

export async function syncIMessage(dbPath: string) {
  console.log(`[imessage] Opening ${dbPath}...`);
  const db = new Database(dbPath, { readonly: true });

  const sourceId = await getSourceId("imessage");

  // Query messages with handle info
  const rows = db
    .prepare(
      `
    SELECT
      m.rowid,
      m.text,
      m.date as timestamp,
      m.is_from_me,
      m.associated_message_type,
      h.id as handle_id,
      h.service
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.rowid
    WHERE m.text IS NOT NULL AND m.text != ''
    ORDER BY m.date ASC
  `
    )
    .all() as any[];

  console.log(`[imessage] Found ${rows.length} text messages`);

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    // Skip reactions/tapbacks
    if (row.associated_message_type && row.associated_message_type !== 0) {
      skipped++;
      continue;
    }

    const sender = row.is_from_me ? "me" : (row.handle_id || "unknown");
    const recipient = row.is_from_me ? (row.handle_id || "unknown") : "me";
    const timestamp = cocoaToISO(row.timestamp);

    const ok = await insertMessage({
      sourceId,
      content: row.text,
      sender,
      recipient,
      timestamp,
      metadata: {
        rowid: row.rowid,
        service: row.service,
        is_from_me: row.is_from_me,
      },
    });

    if (ok) inserted++;
  }

  db.close();
  console.log(
    `[imessage] Done: ${inserted} inserted, ${skipped} reactions skipped, ${rows.length - inserted - skipped} duplicates`
  );
  return { inserted, skipped, total: rows.length };
}

// CLI
if (process.argv[1]?.endsWith("imessage.ts") || process.argv[1]?.endsWith("imessage.js")) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("Usage: tsx src/syncs/imessage.ts <path-to-chat.db>");
    process.exit(1);
  }
  syncIMessage(dbPath).then(() => process.exit(0));
}
