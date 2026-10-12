// api/providers/finnhub — forex headlines (optional enrichment, 60/min).
import { getEnv } from '../config/env.js';
import { readJson } from '../lib/http.js';

interface Article {
  datetime?: number;
  headline?: string;
  summary?: string;
}

export async function fetchHeadlines(): Promise<{ text: string; ok: boolean }> {
  const key = getEnv().FINNHUB_API_KEY;
  if (!key) return { text: '', ok: false };
  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${key}`);
    const data = await readJson(res);
    if (!Array.isArray(data) || data.length === 0) return { text: '', ok: false };
    const text = (data as Article[]).slice(0, 5).map((a) => {
      const when = a.datetime ? new Date(a.datetime * 1000).toISOString() : 'unknown time';
      return `- [${when}] ${a.headline}${a.summary ? ' -- ' + a.summary : ''}`;
    }).join('\n');
    return { text, ok: true };
  } catch {
    return { text: '', ok: false };
  }
}
