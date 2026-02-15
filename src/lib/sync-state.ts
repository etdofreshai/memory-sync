import { pool } from "./db.js";

/**
 * Track sync state per service in a dedicated table.
 * Auto-creates the table if it doesn't exist.
 */

let initialized = false;

async function ensureTable() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      service TEXT PRIMARY KEY,
      last_sync_at TIMESTAMPTZ,
      last_status TEXT DEFAULT 'idle',
      last_inserted INTEGER DEFAULT 0,
      last_error TEXT,
      last_duration_ms INTEGER,
      total_synced INTEGER DEFAULT 0,
      is_running BOOLEAN DEFAULT false
    )
  `);
  initialized = true;
}

export type SyncStatus = {
  service: string;
  last_sync_at: string | null;
  last_status: "idle" | "running" | "ok" | "error";
  last_inserted: number;
  last_error: string | null;
  last_duration_ms: number | null;
  total_synced: number;
  is_running: boolean;
};

export async function getSyncStatus(service?: string): Promise<SyncStatus[]> {
  await ensureTable();
  if (service) {
    const res = await pool.query("SELECT * FROM sync_state WHERE service = $1", [service]);
    return res.rows;
  }
  const res = await pool.query("SELECT * FROM sync_state ORDER BY last_sync_at DESC NULLS LAST");
  return res.rows;
}

export async function markSyncStart(service: string) {
  await ensureTable();
  await pool.query(
    `INSERT INTO sync_state (service, last_status, is_running)
     VALUES ($1, 'running', true)
     ON CONFLICT (service) DO UPDATE SET last_status = 'running', is_running = true`,
    [service]
  );
}

export async function markSyncDone(service: string, inserted: number, durationMs: number) {
  await ensureTable();
  await pool.query(
    `INSERT INTO sync_state (service, last_sync_at, last_status, last_inserted, last_error, last_duration_ms, total_synced, is_running)
     VALUES ($1, NOW(), 'ok', $2, NULL, $3, $2, false)
     ON CONFLICT (service) DO UPDATE SET
       last_sync_at = NOW(),
       last_status = 'ok',
       last_inserted = $2,
       last_error = NULL,
       last_duration_ms = $3,
       total_synced = sync_state.total_synced + $2,
       is_running = false`,
    [service, inserted, durationMs]
  );
}

export async function markSyncError(service: string, error: string, durationMs: number) {
  await ensureTable();
  await pool.query(
    `INSERT INTO sync_state (service, last_sync_at, last_status, last_error, last_duration_ms, is_running)
     VALUES ($1, NOW(), 'error', $2, $3, false)
     ON CONFLICT (service) DO UPDATE SET
       last_sync_at = NOW(),
       last_status = 'error',
       last_error = $2,
       last_duration_ms = $3,
       is_running = false`,
    [service, error, durationMs]
  );
}

/** Wraps a sync function with state tracking */
export function withTracking<T extends { inserted: number }>(
  service: string,
  fn: () => Promise<T>
): () => Promise<T> {
  return async () => {
    await markSyncStart(service);
    const start = Date.now();
    try {
      const result = await fn();
      await markSyncDone(service, result.inserted, Date.now() - start);
      return result;
    } catch (err: any) {
      await markSyncError(service, err.message, Date.now() - start);
      throw err;
    }
  };
}
