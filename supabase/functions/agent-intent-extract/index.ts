// Kōv — Edge Function: agent-intent-extract
// Source: docs/06_AIPromptRegistry.md §1, §2.2; docs/01_ScopeDocument.md §5.5,
// KOV-FR-014; docs/03_MasterPrompts.md §12.2.
//
// First half of the Kōv Agent pipeline. Server-owned, structured-output-only,
// Zod-validated, per-owner rate-limited, minimized/scoped context. Extracts
// intent + matched client/project from a free-text utterance. Never writes to
// any domain table and never triggers a send — its only effect is an ai_runs
// log row; the caller (agent-plan-generate) is a fully separate, explicitly
// human-gated next step.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { fuzzyMatchName, type FuzzyMatchCandidate } from '../../../src/lib/agent/fuzzyMatchName.ts'
import { shouldAutoProceed } from '../../../src/lib/agent/confidenceGate.ts'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const PROMPT_VERSION = 'agent-intent-extract-v1'
const MODEL_ID = 'claude-sonnet-5'
const MAX_TOKENS = 768 // never client-configurable — general rule §1

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX_CALLS = 20

// Recent-activity window for recent_context — §2.2's "bounded, last ~60 days,
// never full history".
const RECENT_CONTEXT_DAYS = 60

// Exact 15-intent list per docs/06_AIPromptRegistry.md §2.2 / 01_ScopeDocument.md §5.5.
const INTENTS = [
  'rapport_termine',
  'paiement_recu',
  'relance',
  'impayes',
  'conflit_planning',
  'livraison',
  'commande',
  'journee',
  'semaine',
  'marge',
  'retard',
  'absence_salarie',
  'acompte',
  'depense',
  'nouveau_client',
  'prospection',
] as const

const MatchedEntitySchema = z.object({
  name_as_understood: z.string().nullable(),
})

const FallbackSuggestionSchema = z.object({
  label: z.string(),
  intent: z.string(),
})

// Model output schema — deliberately does NOT include a final `matched_client_id`
// / `matched_project_id`, only `name_as_understood`: id resolution is done
// server-side by the deterministic Levenshtein matcher below, never trusted
// from the model directly (§2.2's explicit implementation note).
const IntentExtractOutputSchema = z.object({
  detected_intent: z.enum(INTENTS).nullable(),
  intent_confidence: z.number().min(0).max(1),
  second_best_confidence: z.number().min(0).max(1),
  matched_client: MatchedEntitySchema,
  matched_project: MatchedEntitySchema,
  fallback_suggestions: z.array(FallbackSuggestionSchema),
})

type IntentExtractOutput = z.infer<typeof IntentExtractOutputSchema>

const TOOL_NAME = 'extract_intent'

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Extract the intent, and any referenced client/project name, from a French artisan's free-text job-site utterance.",
  input_schema: {
    type: 'object',
    properties: {
      detected_intent: {
        type: ['string', 'null'],
        enum: [...INTENTS, null],
      },
      intent_confidence: { type: 'number', minimum: 0, maximum: 1 },
      second_best_confidence: { type: 'number', minimum: 0, maximum: 1 },
      matched_client: {
        type: 'object',
        properties: { name_as_understood: { type: ['string', 'null'] } },
        required: ['name_as_understood'],
      },
      matched_project: {
        type: 'object',
        properties: { name_as_understood: { type: ['string', 'null'] } },
        required: ['name_as_understood'],
      },
      fallback_suggestions: {
        type: 'array',
        description:
          'Exactly 3 time-of-day-appropriate suggestions, populated whenever detected_intent is null.',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, intent: { type: 'string' } },
          required: ['label', 'intent'],
        },
      },
    },
    required: [
      'detected_intent',
      'intent_confidence',
      'second_best_confidence',
      'matched_client',
      'matched_project',
      'fallback_suggestions',
    ],
  },
}

function systemPrompt(timeOfDay: 'morning' | 'evening'): string {
  return `Tu es le moteur de compréhension du langage naturel de l'agent Kōv, un assistant pour artisans du bâtiment français (plomberie-chauffage).

Un artisan tape ou dicte une phrase en langage de chantier. Tu dois identifier :
1. L'intention (detected_intent) parmi EXACTEMENT ces 15 valeurs : ${INTENTS.join(', ')} — ou null si aucune ne correspond clairement.
2. Le niveau de confiance (intent_confidence, 0-1) et la confiance de la deuxième hypothèse la plus probable (second_best_confidence, 0-1).
3. Le nom du client et/ou du chantier mentionné, tel que tu le comprends (matched_client.name_as_understood, matched_project.name_as_understood) — ne donne JAMAIS d'identifiant, seulement le texte comme tu le comprends ; le rapprochement avec la fiche réelle est fait ailleurs par du code déterministe.

Combine trois signaux pour reconnaître l'intention, exactement comme spécifié :
- Reconnaissance de tournures de chantier entières (ex: "il me manque", "m'a viré", "vient d'arriver").
- Vocabulaire métier pondéré (plomberie/chauffage pèse plus que des mots génériques).
- Tolérance aux noms mal transcrits (la correspondance précise est faite par du code, pas par toi — donne juste le nom tel que tu le comprends).

Contexte temporel : il est actuellement le ${timeOfDay === 'morning' ? 'matin' : 'soir'}.

Règles strictes :
- Si detected_intent est null, fallback_suggestions DOIT contenir exactement 3 suggestions pertinentes pour ce moment de la journée — jamais une liste vide.
- N'invente jamais de fait, de nom de client, ou de montant qui ne figure pas dans l'énoncé.
- Ne mentionne JAMAIS de prix, de montant, de total ou de marge — ce n'est pas ton rôle.
- Réponds UNIQUEMENT en appelant l'outil ${TOOL_NAME} avec les arguments structurés demandés — jamais de texte libre.`
}

interface IntentExtractRequestBody {
  utterance?: string
  time_of_day?: 'morning' | 'evening'
}

async function logRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  fields: {
    inputSummary: Record<string, unknown>
    outputSummary: Record<string, unknown> | null
    status: 'completed' | 'failed' | 'timeout'
    durationMs: number
    idempotencyKey: string
  },
) {
  await admin.from('ai_runs').insert({
    owner_id: ownerId,
    run_type: 'agent_intent',
    input_summary: fields.inputSummary,
    output_summary: fields.outputSummary,
    model_id: MODEL_ID,
    prompt_version: PROMPT_VERSION,
    duration_ms: fields.durationMs,
    status: fields.status,
    idempotency_key: fields.idempotencyKey,
  })
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  let body: IntentExtractRequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const utterance = body.utterance?.trim()
  if (!utterance) {
    return new Response(JSON.stringify({ error: 'Missing utterance' }), { status: 400 })
  }
  const timeOfDay: 'morning' | 'evening' = body.time_of_day === 'evening' ? 'evening' : 'morning'

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

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count: recentCallCount } = await admin
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('run_type', 'agent_intent')
    .gte('created_at', windowStart)

  if (recentCallCount !== null && recentCallCount >= RATE_LIMIT_MAX_CALLS) {
    return new Response(
      JSON.stringify({
        error: 'Limite de requêtes IA atteinte pour cette heure. Réessaie plus tard.',
      }),
      { status: 429 },
    )
  }

  // Minimized/bounded context — this owner's own clients/projects active in
  // the last RECENT_CONTEXT_DAYS, plus a lightweight unpaid-invoices summary.
  const recentSince = new Date(Date.now() - RECENT_CONTEXT_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: recentClients }, { data: recentProjects }, { data: openInvoices }] =
    await Promise.all([
      admin
        .from('clients')
        .select('id, name')
        .eq('owner_id', user.id)
        .eq('status', 'active')
        .gte('created_at', recentSince)
        .limit(50),
      admin
        .from('projects')
        .select('id, name, client_id')
        .eq('owner_id', user.id)
        .gte('created_at', recentSince)
        .limit(50),
      admin
        .from('invoices')
        .select('id, amount_ttc')
        .eq('owner_id', user.id)
        .in('status', ['sent', 'overdue']),
    ])

  const recentClientsList = recentClients ?? []
  const recentProjectsList = recentProjects ?? []
  const openInvoicesSummary = {
    count: openInvoices?.length ?? 0,
    total_overdue: (openInvoices ?? []).reduce((sum, i) => sum + Number(i.amount_ttc ?? 0), 0),
  }

  const idempotencyKey = `${user.id}:${crypto.randomUUID()}`
  const startedAt = Date.now()

  const inputSummary = {
    utterance_length: utterance.length,
    time_of_day: timeOfDay,
    recent_clients_count: recentClientsList.length,
    recent_projects_count: recentProjectsList.length,
  }

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
        system: systemPrompt(timeOfDay),
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              utterance,
              time_of_day: timeOfDay,
              recent_context: {
                recent_clients: recentClientsList,
                recent_projects: recentProjectsList,
                open_invoices_summary: openInvoicesSummary,
              },
            }),
          },
        ],
      }),
    })
  } catch (err) {
    await logRun(admin, user.id, {
      inputSummary,
      outputSummary: null,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      idempotencyKey,
    })
    return new Response(JSON.stringify({ error: 'Échec de l’appel IA. ' + String(err) }), {
      status: 502,
    })
  }

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text()
    await logRun(admin, user.id, {
      inputSummary,
      outputSummary: { anthropic_status: anthropicResponse.status },
      status:
        anthropicResponse.status === 408 || anthropicResponse.status === 504 ? 'timeout' : 'failed',
      durationMs: Date.now() - startedAt,
      idempotencyKey,
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

  // Consistency/diagnosability hardening (2026-10-04) — same fix applied to
  // agent-plan-generate after a live E2E test reproduced an otherwise-
  // undiagnosable schema_validation_failed there. MAX_TOKENS here (768) is
  // small relative to this function's own output shape (intent + a client/
  // project match, no long free-text fields), so truncation is far less
  // likely in practice — this check is added for consistency and as a safety
  // net, not because a real failure of this kind was observed here.
  if (anthropicJson.stop_reason === 'max_tokens') {
    await logRun(admin, user.id, {
      inputSummary,
      outputSummary: { error: 'truncated_max_tokens', max_tokens: MAX_TOKENS },
      status: 'failed',
      durationMs: Date.now() - startedAt,
      idempotencyKey,
    })
    return new Response(
      JSON.stringify({ error: 'La réponse IA était trop longue. Réessaie avec une phrase plus courte.' }),
      { status: 502 },
    )
  }

  const toolUseBlock = anthropicJson.content?.find(
    (block: { type: string }) => block.type === 'tool_use',
  )

  if (!toolUseBlock) {
    await logRun(admin, user.id, {
      inputSummary,
      outputSummary: { error: 'no_tool_use_block' },
      status: 'failed',
      durationMs: Date.now() - startedAt,
      idempotencyKey,
    })
    return new Response(
      JSON.stringify({ error: 'Réponse IA invalide (pas de structured output).' }),
      {
        status: 502,
      },
    )
  }

  const parseResult = IntentExtractOutputSchema.safeParse(toolUseBlock.input)
  if (!parseResult.success) {
    await logRun(admin, user.id, {
      inputSummary,
      outputSummary: {
        error: 'schema_validation_failed',
        zod_issues: parseResult.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
        raw_tool_input: toolUseBlock.input,
      },
      status: 'failed',
      durationMs: Date.now() - startedAt,
      idempotencyKey,
    })
    return new Response(JSON.stringify({ error: 'Réponse IA mal formée.' }), { status: 502 })
  }

  const modelOutput: IntentExtractOutput = parseResult.data

  // Server-side, deterministic client/project resolution — never trust an id
  // from the model (it was never asked for one). Levenshtein fuzzy match
  // against the exact same recent_context lists sent to the model.
  const clientCandidates: FuzzyMatchCandidate[] = recentClientsList.map((c) => ({
    id: c.id,
    name: c.name,
  }))
  const projectCandidates: FuzzyMatchCandidate[] = recentProjectsList.map((p) => ({
    id: p.id,
    name: p.name,
  }))
  const matchedClient = fuzzyMatchName(
    modelOutput.matched_client.name_as_understood,
    clientCandidates,
  )
  const matchedProject = fuzzyMatchName(
    modelOutput.matched_project.name_as_understood,
    projectCandidates,
  )

  // Server-side confidence gate — re-derived deterministically, never trusts
  // any needs_disambiguation flag from the model (the model isn't even asked
  // to produce one; this schema has no such field by design).
  const autoProceed =
    modelOutput.detected_intent !== null &&
    shouldAutoProceed(modelOutput.intent_confidence, modelOutput.second_best_confidence)
  const needsDisambiguation = !autoProceed

  // Guardrail: fallback_suggestions must never be empty when disambiguation
  // is needed — belt-and-suspenders even though the model was instructed to
  // always provide exactly 3.
  const fallbackSuggestions =
    needsDisambiguation && modelOutput.fallback_suggestions.length === 0
      ? DEFAULT_FALLBACKS[timeOfDay]
      : modelOutput.fallback_suggestions

  const sanitizedOutput = {
    detected_intent: modelOutput.detected_intent,
    intent_confidence: modelOutput.intent_confidence,
    second_best_confidence: modelOutput.second_best_confidence,
    matched_client: matchedClient,
    matched_project: matchedProject,
    needs_disambiguation: needsDisambiguation,
    fallback_suggestions: needsDisambiguation ? fallbackSuggestions : [],
  }

  await logRun(admin, user.id, {
    inputSummary,
    outputSummary: {
      detected_intent: sanitizedOutput.detected_intent,
      needs_disambiguation: sanitizedOutput.needs_disambiguation,
      matched_client_confidence: matchedClient.match_confidence,
      matched_project_confidence: matchedProject.match_confidence,
    },
    status: 'completed',
    durationMs: Date.now() - startedAt,
    idempotencyKey,
  })

  return new Response(JSON.stringify(sanitizedOutput), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}))

const DEFAULT_FALLBACKS: Record<'morning' | 'evening', Array<{ label: string; intent: string }>> = {
  morning: [
    { label: 'Voir le planning du jour', intent: 'journee' },
    { label: 'Voir les factures impayées', intent: 'impayes' },
    { label: 'Voir la marge du mois', intent: 'marge' },
  ],
  evening: [
    { label: "Faire le rapport d'un chantier", intent: 'rapport_termine' },
    { label: 'Voir le résumé de la semaine', intent: 'semaine' },
    { label: 'Voir les factures impayées', intent: 'impayes' },
  ],
}
