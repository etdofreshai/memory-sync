import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:bmm34neuoh99j8v6@ai-applications-openclaw-database-nynhln:5432/postgres",
});

export async function getSourceId(name: string): Promise<number> {
  const res = await pool.query("SELECT id FROM sources WHERE name = $1", [name]);
  if (res.rows.length > 0) return res.rows[0].id;
  const ins = await pool.query(
    "INSERT INTO sources (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=$1 RETURNING id",
    [name]
  );
  return ins.rows[0].id;
}

export async function insertMessage(opts: {
  sourceId: number;
  content: string;
  sender: string;
  recipient: string;
  timestamp: string | Date;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO messages (source_id, content, sender, recipient, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        opts.sourceId,
        opts.content.slice(0, 100000),
        opts.sender,
        opts.recipient,
        opts.timestamp,
        JSON.stringify(opts.metadata || {}),
      ]
    );
    return true;
  } catch (err: any) {
    if (err.code === "23505") return false; // duplicate
    console.error(`DB insert error: ${err.message}`);
    return false;
  }
}

export async function getStats() {
  const res = await pool.query(`
    SELECT s.name as source, COUNT(*) as count,
           MIN(m.timestamp) as earliest,
           MAX(m.timestamp) as latest
    FROM messages m
    JOIN sources s ON m.source_id = s.id
    GROUP BY s.name
    ORDER BY count DESC
  `);
  const total = await pool.query("SELECT COUNT(*) as count FROM messages");
  return { sources: res.rows, total: total.rows[0].count };
}

export { pool };
