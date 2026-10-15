// Kōv — Edge Function: quote-draft-assist
// Source: docs/06_AIPromptRegistry.md §1, §2.1; docs/01_ScopeDocument.md KOV-FR-008;
// docs/03_MasterPrompts.md §9.2.
//
// AI-assisted quote line drafting. Server-owned, structured-output-only,
// Zod-validated, per-owner rate-limited, minimized/scoped context (only the
// caller's own ACTIVE price_items). The output schema has NO field capable of
// carrying a price/total/margin figure — "L'IA propose des lignes ; le code
// calcule les montants" (Cahier §3) is enforced by construction here, not by
// convention: there is nowhere in the shape below to put a number that means
// money.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const PROMPT_VERSION = 'quote-draft-assist-v1'
const MODEL_ID = 'claude-sonnet-5'
const MAX_TOKENS = 1024 // never client-configurable — general rule §1

// Per-owner rate limit: general rule §1's "timeout + retry" and cost-control
// posture (docs/06_AIPromptRegistry.md §4) — a simple sliding-window count
// against ai_runs, not a separate quota table, since ai_runs already records
// every call with a timestamp.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX_CALLS = 20 // generous but bounded — tune later if needed

// Output schema — deliberately has NO field that can hold a price, subtotal,
// total, or margin figure. Re-read this before ever touching this file again:
// if you find yourself wanting to add one, stop — that number must come from
// src/lib/calc/quoteTotals.ts server-side, never from the model.
const ProposedLineSchema = z.object({
  catalogue_item_id: z.string().uuid().nullable(),
  matched_label: z.string(),
  suggested_quantity: z.number().nullable(),
  unit: z.string(),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
})

const DraftAssistOutputSchema = z.object({
  proposed_lines: z.array(ProposedLineSchema),
  clarification_questions: z.array(z.string()),
  unmatched_notes: z.array(z.string()),
})

type DraftAssistOutput = z.infer<typeof DraftAssistOutputSchema>

const TOOL_NAME = 'propose_quote_lines'

// Claude's tool-use/structured-output feature — the model must call this
// tool with arguments matching this exact JSON schema, never emit free text
// that gets parsed. Mirrors DraftAssistOutputSchema field-for-field.
const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    'Propose quote line items matched against the given price-library catalogue, given a free-text description of plumbing/heating work.',
  input_schema: {
    type: 'object',
    properties: {
      proposed_lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            catalogue_item_id: {
              type: ['string', 'null'],
              description:
                'Must be an id from the provided active_catalogue, or null if unmatched.',
            },
            matched_label: { type: 'string' },
            suggested_quantity: { type: ['number', 'null'] },
            unit: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            needs_clarification: { type: 'boolean' },
          },
          required: [
            'catalogue_item_id',
            'matched_label',
            'suggested_quantity',
            'unit',
            'confidence',
            'needs_clarification',
          ],
        },
      },
      clarification_questions: { type: 'array', items: { type: 'string' } },
      unmatched_notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['proposed_lines', 'clarification_questions', 'unmatched_notes'],
  },
}

function systemPrompt(): string {
  // Guardrail language embedded directly in the prompt — general rule §7.
  return `Tu es un assistant qui aide un artisan plombier-chauffagiste français à rédiger les lignes d'un devis à partir d'une description en langage naturel.

Règles strictes :
- Ne propose QUE des articles présents dans le catalogue fourni (active_catalogue). N'invente jamais un identifiant.
- Si aucun article du catalogue ne correspond clairement à un élément de la description, mets catalogue_item_id à null et needs_clarification à true pour cette ligne.
- N'invente jamais de fait client, de quantité si elle n'est pas déductible du texte, ou d'article de catalogue inexistant.
- Ne mentionne JAMAIS de prix, de montant, de total ou de marge dans ta réponse — ce n'est pas ton rôle, ces valeurs sont calculées ailleurs par du code déterministe.
- Réponds UNIQUEMENT en appelant l'outil ${TOOL_NAME} avec les arguments structurés demandés — jamais de texte libre.`
}

interface DraftAssistRequestBody {
  quoteId?: string
  description?: string
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  // Reject any client-supplied "system" prompt or max_tokens override — hard
  // requirement (general rule §1, master prompt item 4). We deliberately only
  // read `description` (and `quoteId`, used only for ai_runs bookkeeping) from
  // the body — anything else the client sends is silently ignored, never
  // merged into the request sent to Anthropic.
  let body: DraftAssistRequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const description = body.description?.trim()
  if (!description) {
    return new Response(JSON.stringify({ error: 'Missing description' }), { status: 400 })
  }

  const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Per-owner rate limit.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count: recentCallCount } = await admin
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('run_type', 'quote_draft')
    .gte('created_at', windowStart)

  if (recentCallCount !== null && recentCallCount >= RATE_LIMIT_MAX_CALLS) {
    return new Response(
      JSON.stringify({
        error: 'Limite de requêtes IA atteinte pour cette heure. Réessaie plus tard.',
      }),
      { status: 429 },
    )
  }

  // Minimized/scoped context — only THIS owner's ACTIVE price_items (general
  // rule §4, and §2.1's explicit "never another owner's catalogue, never
  // inactive items"). RLS on price_items would also enforce owner-scoping
  // even on the admin client's query here since we filter explicitly, but the
  // .eq('owner_id', ...) is the real enforcement point since the admin client
  // bypasses RLS.
  const { data: activeCatalogue, error: catalogueError } = await admin
    .from('price_items')
    .select('id, label, unit, sale_price, category')
    .eq('owner_id', user.id)
    .eq('active', true)

  if (catalogueError) {
    return new Response(JSON.stringify({ error: catalogueError.message }), { status: 500 })
  }

  const { data: profile } = await admin.from('profiles').select('trade').eq('id', user.id).single()

  const idempotencyKey = `${user.id}:${crypto.randomUUID()}`
  const startedAt = Date.now()

  let anthropicResponse: Response
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(),
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              description,
              trade: profile?.trade ?? 'plomberie_chauffage',
              active_catalogue: activeCatalogue ?? [],
            }),
          },
        ],
      }),
    })
  } catch (err) {
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'quote_draft',
      input_summary: {
        description_length: description.length,
        catalogue_size: activeCatalogue?.length ?? 0,
      },
      output_summary: null,
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status: 'failed',
      idempotency_key: idempotencyKey,
    })
    return new Response(JSON.stringify({ error: 'Échec de l’appel IA. ' + String(err) }), {
      status: 502,
    })
  }

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text()
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'quote_draft',
      input_summary: {
        description_length: description.length,
        catalogue_size: activeCatalogue?.length ?? 0,
      },
      output_summary: { anthropic_status: anthropicResponse.status },
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status:
        anthropicResponse.status === 408 || anthropicResponse.status === 504 ? 'timeout' : 'failed',
      idempotency_key: idempotencyKey,
    })
    return new Response(
      JSON.stringify({
        error: 'L’assistant IA est momentanément indisponible.',
        detail: errorText,
      }),
      { status: 502 },
    )
  }

  const anthropicJson = await anthropicResponse.json()
  const toolUseBlock = anthropicJson.content?.find(
    (block: { type: string }) => block.type === 'tool_use',
  )

  if (!toolUseBlock) {
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'quote_draft',
      input_summary: {
        description_length: description.length,
        catalogue_size: activeCatalogue?.length ?? 0,
      },
      output_summary: { error: 'no_tool_use_block' },
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status: 'failed',
      idempotency_key: idempotencyKey,
    })
    return new Response(
      JSON.stringify({ error: 'Réponse IA invalide (pas de structured output).' }),
      {
        status: 502,
      },
    )
  }

  const parseResult = DraftAssistOutputSchema.safeParse(toolUseBlock.input)
  if (!parseResult.success) {
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'quote_draft',
      input_summary: {
        description_length: description.length,
        catalogue_size: activeCatalogue?.length ?? 0,
      },
      output_summary: { error: 'schema_validation_failed' },
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status: 'failed',
      idempotency_key: idempotencyKey,
    })
    return new Response(JSON.stringify({ error: 'Réponse IA mal formée.' }), { status: 502 })
  }

  const output: DraftAssistOutput = parseResult.data

  // Hard guardrail, enforced server-side before the response ever reaches the
  // client: strip/null-out any catalogue_item_id that isn't actually in the
  // active_catalogue we sent — never trust the model not to hallucinate one.
  const validIds = new Set((activeCatalogue ?? []).map((item) => item.id))
  const sanitizedLines = output.proposed_lines.map((line) => {
    if (line.catalogue_item_id !== null && !validIds.has(line.catalogue_item_id)) {
      return { ...line, catalogue_item_id: null, needs_clarification: true }
    }
    // If catalogue_item_id is null, needs_clarification must be true (§2.1) —
    // enforce this even if the model's own output_schema-conformant response
    // somehow got this wrong (belt and suspenders, since needs_clarification
    // is model-authored and not itself guardable by the JSON schema alone).
    if (line.catalogue_item_id === null && !line.needs_clarification) {
      return { ...line, needs_clarification: true }
    }
    return line
  })

  const sanitizedOutput: DraftAssistOutput = { ...output, proposed_lines: sanitizedLines }

  // Redacted summaries only — never store the full raw prompt/response text
  // (docs/06_AIPromptRegistry.md §4 / NFR in 01_ScopeDocument.md §7).
  await admin.from('ai_runs').insert({
    owner_id: user.id,
    run_type: 'quote_draft',
    input_summary: {
      description_length: description.length,
      catalogue_size: activeCatalogue?.length ?? 0,
    },
    output_summary: {
      proposed_line_count: sanitizedOutput.proposed_lines.length,
      needs_clarification_count: sanitizedOutput.proposed_lines.filter((l) => l.needs_clarification)
        .length,
    },
    model_id: MODEL_ID,
    prompt_version: PROMPT_VERSION,
    cost_usd: null, // Anthropic doesn't return per-call cost directly; computed from usage tokens if needed later.
    duration_ms: Date.now() - startedAt,
    status: 'completed',
    idempotency_key: idempotencyKey,
  })

  return new Response(JSON.stringify(sanitizedOutput), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}))
