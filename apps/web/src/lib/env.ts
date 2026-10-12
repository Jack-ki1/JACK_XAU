// lib/env.ts (Phase 1) — zod-validated environment, parsed once and cached.
// Nothing is required at boot: missing keys put the feature in a `disabled`
// state with a reason instead of crashing (non-negotiable: boots w/o creds).
// Phase 3 promotes this to apps/api config; routes keep working unchanged.

import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  TWELVEDATA_API_KEY: z.string().min(1).optional(),
  TWELVEDATA_API_KEY_RESOLUTION: z.string().min(1).optional(),
  TWELVEDATA_API_KEY_ANALYSED_SIGNALS: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY_ANALYSED_SIGNALS: z.string().min(1).optional(),
  GROQ_API_KEY_NEWS_SIGNALS: z.string().min(1).optional(),
  JBLANKED_API_KEY: z.string().min(1).optional(),
  FINNHUB_API_KEY: z.string().min(1).optional(),
  // Phase-1 kill switches / limits (all optional, safe defaults).
  BACKTEST_ENABLED: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  // Lenient by design: unknown/extra vars pass through, invalid values for
  // *known* keys fall back to undefined (feature disabled, never crash).
  if (!parsed.success) {
    const fallback: Env = {};
    for (const key of Object.keys(envSchema.shape) as (keyof Env)[]) {
      const v = process.env[key];
      if (typeof v === 'string' && v.length > 0) {
        // Minimal sanity: URLs must parse, everything else passes through.
        if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
          try {
            new URL(v);
            (fallback as Record<string, string>)[key] = v;
          } catch {
            /* disabled */
          }
        } else {
          (fallback as Record<string, string>)[key] = v;
        }
      }
    }
    cached = fallback;
    return cached;
  }
  cached = parsed.data;
  return cached;
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(getEnv().NEXT_PUBLIC_SUPABASE_URL && getEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isDemoMode = (): boolean => !getEnv().NEXT_PUBLIC_SUPABASE_URL;

/** Feature flags with human-readable disabled reasons for the UI. */
export function featureStatus(): Record<string, { enabled: boolean; reason?: string }> {
  const e = getEnv();
  return {
    liveData: e.NEXT_PUBLIC_SUPABASE_URL
      ? { enabled: true }
      : { enabled: false, reason: 'NEXT_PUBLIC_SUPABASE_URL not set — demo mode' },
    resolution: e.TWELVEDATA_API_KEY_RESOLUTION
      ? { enabled: true }
      : { enabled: false, reason: 'TWELVEDATA_API_KEY_RESOLUTION not set' },
    backtest:
      e.BACKTEST_ENABLED === 'false'
        ? { enabled: false, reason: 'BACKTEST_ENABLED=false' }
        : e.TWELVEDATA_API_KEY
          ? { enabled: true }
          : { enabled: false, reason: 'TWELVEDATA_API_KEY not set' },
    llmAnalysis: e.GROQ_API_KEY_ANALYSED_SIGNALS
      ? { enabled: true }
      : { enabled: false, reason: 'GROQ_API_KEY_ANALYSED_SIGNALS not set' },
    calendar: e.JBLANKED_API_KEY
      ? { enabled: true }
      : { enabled: false, reason: 'JBLANKED_API_KEY not set' },
  };
}
