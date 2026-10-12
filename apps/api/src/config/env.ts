// api/config — zod-validated env, parsed once at boot. Nothing required:
// missing keys disable features with reasons (demo philosophy holds here).
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3101),
  HOST: z.string().default('0.0.0.0'),
  API_TOKEN: z.string().min(8).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  TWELVEDATA_API_KEY: z.string().min(1).optional(),
  TWELVEDATA_API_KEY_RESOLUTION: z.string().min(1).optional(),
  TWELVEDATA_API_KEY_ANALYSED_SIGNALS: z.string().min(1).optional(),
  GROQ_API_KEY_ANALYSED_SIGNALS: z.string().min(1).optional(),
  GROQ_API_KEY_NEWS_SIGNALS: z.string().min(1).optional(),
  JBLANKED_API_KEY: z.string().min(1).optional(),
  FINNHUB_API_KEY: z.string().min(1).optional(),
  BACKTEST_ENABLED: z.enum(['true', 'false']).optional(),
  JOBS_ENABLED: z.enum(['true', 'false']).optional(),
});

export type ApiEnv = z.infer<typeof schema>;

let cached: ApiEnv | null = null;

export function getEnv(): ApiEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Lenient fallback: keep valid values, drop invalid ones (never crash).
    const fallback: Record<string, unknown> = { PORT: 3101, HOST: '0.0.0.0' };
    for (const key of Object.keys(schema.shape)) {
      const v = process.env[key];
      if (typeof v === 'string' && v.length > 0) {
        if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
          try {
            new URL(v);
            fallback[key] = v;
          } catch {
            /* disabled */
          }
        } else if (key === 'PORT') {
          const n = Number(v);
          if (Number.isInteger(n) && n > 0) fallback[key] = n;
        } else {
          fallback[key] = v;
        }
      }
    }
    cached = fallback as ApiEnv;
    return cached;
  }
  cached = parsed.data;
  return cached;
}

export const hasDb = () => Boolean(getEnv().NEXT_PUBLIC_SUPABASE_URL && getEnv().SUPABASE_SERVICE_KEY);
