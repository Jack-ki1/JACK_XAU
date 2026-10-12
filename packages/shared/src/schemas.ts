// @jack-trade/shared — zod contracts at every boundary (§7).
// HTTP request/response, Supabase rows, LLM output, env. Single definitions;
// web and api both import from here. No runtime imports besides zod.

import { z } from 'zod';

export const directionSchema = z.enum(['buy', 'sell']);
export const verdictSchema = z.enum(['valid', 'invalid']);
export const signalStatusSchema = z.enum(['open', 'closed']);
export const finalOutcomeSchema = z.enum(['tp_hit', 'stopped_out']);

export const exitsSchema = z.object({
  sl: z.number().nullable().optional(),
  tp: z.number().nullable().optional(),
  tp1: z.number().nullable().optional(),
  tp2: z.number().nullable().optional(),
  tp3: z.number().nullable().optional(),
  rr_selected: z.number().nullable().optional(),
});

export const signalRowSchema = z.object({
  id: z.number(),
  signal_id: z.string(),
  symbol: z.string().nullable().optional(),
  direction: z.string().nullable().optional(),
  signal_type: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  entry: z.number().nullable().optional(),
  exits: exitsSchema.nullable().optional(),
  status: z.string().nullable().optional(),
  final_outcome: z.string().nullable().optional(),
  created_at: z.string(),
});

export const llmVerdictSchema = z.object({
  verdict: verdictSchema,
  reasoning: z.string().optional(),
  preferred_rr: z.number().nullable().optional(),
});

export const backtestParamsSchema = z.object({
  htfMidRejMinCount: z.number().int().min(1).max(6),
  confirmDisplacementPct: z.number().positive(),
  execCsodDisplacementPct: z.number().positive(),
  pullbackDispMinPct: z.number().nonnegative(),
  pullbackDispMaxPct: z.number().nonnegative(),
  maxSLPoints: z.number().positive(),
  slBufferPointsFlat: z.number().nonnegative(),
  minSLPoints: z.number().nonnegative(),
  sniperRRLevels: z.array(z.number().positive()),
  precisionRRLevels: z.array(z.number().positive()),
  swingPivotLen: z.number().int().min(1),
});

export const backtestRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  configs: z.array(z.object({ name: z.string(), params: backtestParamsSchema.partial() })).max(4).optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

export type SignalRowT = z.infer<typeof signalRowSchema>;
export type LlmVerdictT = z.infer<typeof llmVerdictSchema>;
export type BacktestRequestT = z.infer<typeof backtestRequestSchema>;
