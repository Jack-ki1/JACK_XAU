// api/lib/http — fetch JSON with a usable type (Response.json() is
// untyped; every boundary gets an explicit cast, never `any`).
export type Json = Record<string, unknown>;

export async function readJson(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}
