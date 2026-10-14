// api/providers/llm — Groq (OpenAI-compatible) chat provider. Swap-able:
// all callers use completeVerdict() and get engine-normalized output back,
// plus run metadata (latency/tokens) for the ai_runs audit trail.
import { normalizeVerdict, type LlmVerdict } from '@jack-trade/engine';
import { errorMessage } from '../lib/errors.js';
import { readJson } from '../lib/http.js';

const MODEL = 'openai/gpt-oss-120b';

export interface VerdictRun extends LlmVerdict {
  run: { latencyMs: number; tokens: number | null };
}

export function modelName(): string {
  return MODEL;
}

export async function completeVerdict(apiKey: string | undefined, prompt: string): Promise<VerdictRun> {
  if (!apiKey) throw new Error('LLM key not set.');
  const started = Date.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 600,
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await readJson(res);
  const latencyMs = Date.now() - started;
  const groqError = data.error as { message?: string } | undefined;
  if (!res.ok || groqError) throw new Error(groqError?.message || `Groq HTTP ${res.status}`);
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const rawText: string = choices?.[0]?.message?.content || '';
  const tokens = (data.usage as { total_tokens?: number } | undefined)?.total_tokens ?? null;
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  try {
    const parsed = normalizeVerdict(JSON.parse(cleaned) as unknown);
    return { ...parsed, run: { latencyMs, tokens } };
  } catch (e) {
    throw new Error(`LLM returned non-JSON: ${errorMessage(e)}`);
  }
}
