// api/repositories — the ONLY place Supabase is touched. Server-side,
// service key, never shipped to the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient | null {
  const e = getEnv();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_KEY) return null;
  if (!client) client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_KEY);
  return client;
}

/** Throws a typed disabled error when no DB is configured. */
export function requireDb(): SupabaseClient {
  const db = getDb();
  if (!db) {
    const err = new Error('Database not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY missing).') as Error & { code: string };
    err.code = 'db_disabled';
    throw err;
  }
  return db;
}
