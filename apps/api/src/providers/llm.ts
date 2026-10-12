// api/providers/llm — Groq (OpenAI-compatible) chat provider. Swap-able:
// all callers use completeVerdict() and get engine-normalized output back.
import { normalizeVerdict, type LlmVerdict } from '@jack-trade/engine';
import { errorMessage } from '../lib/errors.js';
import { readJson } from '../lib/http.js';

const MODEL = 'openai/gpt-oss-120b';

export function modelName(): string {
  return MODEL;
}

export async function completeVerdict(apiKey: string | undefined, prompt: string): Promise<LlmVerdict> {
  if (!apiKey) throw new Error('LLM key not set.');
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
  const groqError = data.error as { message?: string } | undefined;
  if (!res.ok || groqError) throw new Error(groqError?.message || `Groq HTTP ${res.status}`);
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const rawText: string = choices?.[0]?.message?.content || '';
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  try {
    return normalizeVerdict(JSON.parse(cleaned) as unknown);
  } catch (e) {
    throw new Error(`LLM returned non-JSON: ${errorMessage(e)}`);
  }
}
