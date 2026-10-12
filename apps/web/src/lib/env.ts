// web/lib/env — browser-safe config. Only NEXT_PUBLIC_* values may reach
// the browser; the machine secret lives server-side (proxy route handlers).
// Phase 3: all provider/service keys moved to apps/api. Nothing required.

import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  // Server-side only (same-origin proxy + forwarders). Never NEXT_PUBLIC_.
  CRON_SECRET: z.string().min(1).optional(),
  API_TOKEN: z.string().min(1).optional(),
  API_BASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  cached = parsed.success ? parsed.data : {};
  return cached;
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(getEnv().NEXT_PUBLIC_SUPABASE_URL && getEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isDemoMode = (): boolean => !getEnv().NEXT_PUBLIC_SUPABASE_URL;
