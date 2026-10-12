// Phase 3: RETIRED. The legacy Groq spot-check route (unguarded, third LLM
// key, no UI callers) is superseded by POST /v1/signals/analyse.
export async function GET() {
  return Response.json(
    { error: 'Gone in Phase 3 — use POST /api/v1/signals/analyse (proxied to the API service).' },
    { status: 410 },
  );
}
