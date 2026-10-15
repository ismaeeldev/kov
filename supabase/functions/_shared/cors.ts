// Kōv — shared CORS headers for every Edge Function.
//
// Every function is called from the browser via supabase-js's
// `client.functions.invoke()`, which sends a real cross-origin preflight
// (OPTIONS) request whenever a custom header like Authorization is present —
// which is every authenticated call this app makes. Without these headers,
// Supabase's edge runtime returns a bare 405 with no Access-Control-Allow-*
// headers for OPTIONS, so the browser blocks the real request before it ever
// reaches the function body — found live via Playwright: every AI feature
// (quote-draft-assist, agent-intent-extract, agent-plan-generate) and the
// account-deletion/chantier-conversion/quote-issue flows all failed silently
// in the real UI with a CORS error, despite working fine when called directly
// via a server-side fetch (which doesn't send an Origin header, so never
// triggers a preflight) — that gap is exactly what masked this bug until a
// real browser test caught it.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Wraps a Deno.serve handler so every function only has to write its normal
 * POST logic — this takes care of the OPTIONS preflight (returned with no
 * body, per the Fetch spec) and merges corsHeaders onto whatever Response
 * the handler returns, without needing to touch every individual
 * `new Response(...)` call in the function body.
 */
export function withCors(
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }
    const response = await handler(req)
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
