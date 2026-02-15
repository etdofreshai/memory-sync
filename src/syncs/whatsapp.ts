/**
 * WhatsApp sync — ingests from exported chat .txt files.
 * Usage: tsx src/syncs/whatsapp.ts <path-to-chat-export.txt>
 *
 * WhatsApp export format (varies by locale):
 * [1/15/26, 3:45:12 PM] John Doe: Hello there
 * or
 * 1/15/26, 3:45 PM - John Doe: Hello there
 */

import { readFileSync } from "fs";
import { getSourceId, insertMessage } from "../lib/db.js";

// Common WhatsApp export patterns
const LINE_PATTERNS = [
  // [M/D/YY, H:MM:SS AM] Name: Message
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\]\s+([^:]+):\s+(.*)/i,
  // M/D/YY, H:MM AM - Name: Message
  /^(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s*-\s+([^:]+):\s+(.*)/i,
  // D/M/YY, H:MM - Name: Message (EU format)
  /^(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2})\s*-\s+([^:]+):\s+(.*)/i,
];

function parseLine(line: string): { timestamp: string; sender: string; content: string } | null {
  for (const pattern of LINE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      const dateStr = match[1];
      const sender = match[2].trim();
      const content = match[3].trim();

      // Skip system messages
      if (
        content.includes("Messages and calls are end-to-end encrypted") ||
        content.includes("created group") ||
        content.includes("added you") ||
        content === "<Media omitted>"
      ) {
        return null;
      }

      // Parse date
      const date = new Date(dateStr);
      const timestamp = isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();

      return { timestamp, sender, content };
    }
  }
  return null;
}

export async function syncWhatsApp(filePath: string, chatName?: string) {
  console.log(`[whatsapp] Reading ${filePath}...`);
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");

  const sourceId = await getSourceId("whatsapp");
  let inserted = 0;
  let currentMessage: { timestamp: string; sender: string; content: string } | null = null;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      // Save previous message
      if (currentMessage) {
        const ok = await insertMessage({
          sourceId,
          content: currentMessage.content,
          sender: currentMessage.sender,
          recipient: chatName || "unknown",
          timestamp: currentMessage.timestamp,
          metadata: { chat: chatName },
        });
        if (ok) inserted++;
      }
      currentMessage = parsed;
    } else if (currentMessage && line.trim()) {
      // Continuation of previous message
      currentMessage.content += "\n" + line;
    }
  }

  // Don't forget last message
  if (currentMessage) {
    const ok = await insertMessage({
      sourceId,
      content: currentMessage.content,
      sender: currentMessage.sender,
      recipient: chatName || "unknown",
      timestamp: currentMessage.timestamp,
      metadata: { chat: chatName },
    });
    if (ok) inserted++;
  }

  console.log(`[whatsapp] Done: ${inserted} messages inserted from ${lines.length} lines`);
  return { inserted, lines: lines.length };
}

// CLI
if (process.argv[1]?.endsWith("whatsapp.ts") || process.argv[1]?.endsWith("whatsapp.js")) {
  const filePath = process.argv[2];
  const chatName = process.argv[3];
  if (!filePath) {
    console.error("Usage: tsx src/syncs/whatsapp.ts <chat-export.txt> [chat-name]");
    process.exit(1);
  }
  syncWhatsApp(filePath, chatName).then(() => process.exit(0));
}
