// Kōv — Edge Function: agent-plan-generate
// Source: docs/06_AIPromptRegistry.md §1, §2.3; docs/01_ScopeDocument.md §5.5,
// KOV-FR-014; docs/03_MasterPrompts.md §12.3.
//
// Second half of the Kōv Agent pipeline — follows a resolved (or
// user-disambiguated) intent from agent-intent-extract. Produces an ordered,
// fully-reviewable action plan. Per §2.3's execution contract: "the Edge
// Function's only job is to write the response into agent_action_plans with
// status='proposed'" — NOTHING here executes anything. Execution is entirely
// separate application code (src/features/agent/executePlan.ts), gated on
// the artisan's explicit confirm.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const PROMPT_VERSION = 'agent-plan-generate-v1'
const MODEL_ID = 'claude-sonnet-5'
// Raised from 1024 (2026-10-04) — a live E2E test produced an intermittent,
// otherwise-undiagnosable schema_validation_failed; 1024 tokens is tight for
// a 3-4 step plan where a send_message step's message_text must be the full,
// final text (never a placeholder — see the system prompt below), especially
// a formal recommandé-AR letter. A truncated tool_use response (Claude cut
// off mid-JSON by hitting the cap) produces exactly this failure signature:
// a 200 from Anthropic, but malformed/incomplete tool input that fails Zod
// with no indication it was a truncation, not a genuine model error.
const MAX_TOKENS = 2048

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX_CALLS = 20

const PlanStepSchema = z.object({
  step_id: z.string(),
  step_type: z.enum(['send_message', 'log_note', 'create_reminder', 'update_status']),
  removable: z.boolean(),
  target_channel: z.enum(['sms', 'email', 'recommande_ar']).nullable(),
  recipient: z.string().nullable(),
  message_text: z.string().nullable(),
  description: z.string(),
})

const PlanGenerateOutputSchema = z.object({
  plan_summary: z.string(),
  steps: z.array(PlanStepSchema),
})

type PlanGenerateOutput = z.infer<typeof PlanGenerateOutputSchema>

const TOOL_NAME = 'generate_action_plan'

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Generate a reviewable, step-by-step action plan for a French artisan's confirmed intent.",
  input_schema: {
    type: 'object',
    properties: {
      plan_summary: { type: 'string' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            step_id: { type: 'string' },
            step_type: {
              type: 'string',
              enum: ['send_message', 'log_note', 'create_reminder', 'update_status'],
            },
            removable: { type: 'boolean' },
            target_channel: {
              type: ['string', 'null'],
              enum: ['sms', 'email', 'recommande_ar', null],
            },
            recipient: { type: ['string', 'null'] },
            message_text: {
              type: ['string', 'null'],
              description:
                'REQUIRED, complete and final if step_type is send_message — never a placeholder or summary.',
            },
            description: { type: 'string' },
          },
          required: [
            'step_id',
            'step_type',
            'removable',
            'target_channel',
            'recipient',
            'message_text',
            'description',
          ],
        },
      },
    },
    required: ['plan_summary', 'steps'],
  },
}

function systemPrompt(): string {
  return `Tu es le générateur de plan d'action de l'agent Kōv, pour un artisan du bâtiment français (plomberie-chauffage).

À partir d'une intention déjà confirmée et des informations réelles fournies, propose un plan d'action détaillé, étape par étape.

Règles strictes :
- Pour toute étape de type send_message, message_text est OBLIGATOIRE et doit être le texte COMPLET et FINAL, jamais un résumé ou un placeholder — ce texte sera montré et potentiellement envoyé tel quel.
- Chaque étape doit avoir removable=true, sauf cas rare où elle est purement interne sans aucun effet externe.
- N'invente JAMAIS de fait, de montant, de date ou de nom qui ne figure pas dans les informations fournies (relevant_records).
- Ne fixe JAMAIS un prix, un total ou une marge — utilise uniquement les montants déjà fournis dans relevant_records.
- Tu ne déclenches RIEN toi-même — tu proposes uniquement un plan que l'artisan validera ou non.
- Réponds UNIQUEMENT en appelant l'outil ${TOOL_NAME} avec les arguments structurés JSON demandés par son schéma — jamais de texte libre, et surtout jamais de balises de type XML/markup (par ex. <steps>, <step_id>, </plan_summary>) à l'intérieur des valeurs des champs. plan_summary et chaque message_text/description doivent être du texte brut uniquement, sans aucune balise.
- steps doit toujours être un tableau JSON contenant au moins une étape, même pour une intention qui ne nécessite qu'une seule note interne (step_type=log_note) — ne laisse jamais ce champ absent ou vide.`
}

interface PlanGenerateRequestBody {
  detected_intent?: string
  matched_client_id?: string
  matched_project_id?: string | null
  ai_run_id?: string // the agent_intent ai_runs row this plan follows, for audit linkage
  source_utterance?: string
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  let body: PlanGenerateRequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const detectedIntent = body.detected_intent?.trim()
  const matchedClientId = body.matched_client_id?.trim()
  const sourceUtterance = body.source_utterance?.trim()
  if (!detectedIntent || !matchedClientId || !sourceUtterance) {
    return new Response(
      JSON.stringify({ error: 'Missing detected_intent, matched_client_id, or source_utterance' }),
      { status: 400 },
    )
  }
  const matchedProjectId = body.matched_project_id ?? null

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
    .eq('run_type', 'agent_plan')
    .gte('created_at', windowStart)

  if (recentCallCount !== null && recentCallCount >= RATE_LIMIT_MAX_CALLS) {
    return new Response(
      JSON.stringify({
        error: 'Limite de requêtes IA atteinte pour cette heure. Réessaie plus tard.',
      }),
      { status: 429 },
    )
  }

  // Verify the matched client actually belongs to this owner — never trust a
  // client-supplied id without an ownership check, even though it came from
  // agent-intent-extract's own (also owner-scoped) resolution.
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, name, phone, email')
    .eq('id', matchedClientId)
    .eq('owner_id', user.id)
    .single()

  if (clientError || !client) {
    return new Response(JSON.stringify({ error: 'Client introuvable.' }), { status: 404 })
  }

  let project: { id: string; name: string; status: string } | null = null
  if (matchedProjectId) {
    const { data: projectData } = await admin
      .from('projects')
      .select('id, name, status')
      .eq('id', matchedProjectId)
      .eq('owner_id', user.id)
      .single()
    project = projectData ?? null
  }

  // Minimized/scoped relevant_records — this owner's own data only, bounded.
  const { data: openInvoice } = await admin
    .from('invoices')
    .select('id, amount_ttc, due_date, dunning_level, invoice_type')
    .eq('owner_id', user.id)
    .eq('client_id', client.id)
    .in('status', ['sent', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: recentJournalEntries } = await admin
    .from('journal')
    .select('entry_type, direction, title, occurred_at')
    .eq('owner_id', user.id)
    .eq('client_id', client.id)
    .order('occurred_at', { ascending: false })
    .limit(5)

  const relevantRecords = {
    open_invoice: openInvoice ?? null,
    recent_journal_entries: recentJournalEntries ?? [],
    project_summary: project,
    client: { id: client.id, name: client.name, phone: client.phone, email: client.email },
  }

  // Deterministic idempotency key (2026-10-04 stability fix) — previously
  // `${user.id}:${crypto.randomUUID()}` was random on every call, so
  // ai_runs.idempotency_key's real unique constraint could never actually
  // collide/reject a genuine duplicate: a client-side timeout (whose
  // abort doesn't necessarily stop server-side Deno execution) followed by
  // a user's manual retry could leave two unrelated 'proposed' plan rows
  // for the same request instead of one. Bucketing by a short (2-minute)
  // time window means a near-simultaneous duplicate (the actual bug this
  // guards against) collides and is rejected, while a genuinely new later
  // request with the same text (e.g. the artisan asking the same thing
  // again tomorrow) still gets its own fresh key and a fresh plan.
  const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000
  const timeBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)
  const idempotencyKey = `${user.id}:${matchedClientId}:${detectedIntent}:${sourceUtterance}:${timeBucket}`

  // Pre-check (not just relying on the unique constraint after the fact) —
  // avoids wasting a real Claude call + spend on a request this function can
  // already tell is a duplicate of one it (or a still-in-flight concurrent
  // call) already completed in this same window. If a prior ai_runs row with
  // this exact key exists and completed successfully, its linked plan is
  // returned directly instead of generating a second one.
  const { data: existingRun } = await admin
    .from('ai_runs')
    .select('id, status')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existingRun && existingRun.status === 'completed') {
    const { data: existingPlan } = await admin
      .from('agent_action_plans')
      .select('id, plan_steps, status, created_at')
      .eq('ai_run_id', existingRun.id)
      .maybeSingle()
    if (existingPlan) {
      return new Response(JSON.stringify(existingPlan), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const startedAt = Date.now()
  const inputSummary = {
    detected_intent: detectedIntent,
    has_project: project !== null,
    has_open_invoice: openInvoice !== null,
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
        system: systemPrompt(),
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              detected_intent: detectedIntent,
              source_utterance: sourceUtterance,
              matched_client_id: matchedClientId,
              matched_project_id: matchedProjectId,
              relevant_records: relevantRecords,
            }),
          },
        ],
      }),
    })
  } catch (err) {
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'agent_plan',
      input_summary: inputSummary,
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
      run_type: 'agent_plan',
      input_summary: inputSummary,
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

  // Detect truncation explicitly (2026-10-04 hardening — see MAX_TOKENS'
  // comment above for the full story) — a response cut off by the token cap
  // still comes back as a 200 with a tool_use block, just one whose `input`
  // may be incomplete/malformed JSON. Catching this here, before attempting
  // to Zod-parse it, turns a generic "schema_validation_failed" into a
  // clearly-labeled, immediately-diagnosable failure mode instead.
  if (anthropicJson.stop_reason === 'max_tokens') {
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'agent_plan',
      input_summary: inputSummary,
      output_summary: { error: 'truncated_max_tokens', max_tokens: MAX_TOKENS },
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status: 'failed',
      idempotency_key: idempotencyKey,
    })
    return new Response(
      JSON.stringify({ error: 'Le plan généré était trop long. Réessaie avec une demande plus simple.' }),
      { status: 502 },
    )
  }

  const toolUseBlock = anthropicJson.content?.find(
    (block: { type: string }) => block.type === 'tool_use',
  )

  if (!toolUseBlock) {
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'agent_plan',
      input_summary: inputSummary,
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

  const parseResult = PlanGenerateOutputSchema.safeParse(toolUseBlock.input)
  if (!parseResult.success) {
    // Diagnosability fix (2026-10-04, found via a live E2E agent test that
    // reproduced a real schema_validation_failed with NO way to tell which
    // field Claude actually got wrong — the previous version discarded both
    // the Zod error and the raw tool-call input, making this undiagnosable
    // without redeploying with ad-hoc logging). Store the real Zod issues
    // (field paths + messages, never arbitrarily large) and the raw tool
    // input itself (redacted of nothing — this is the owner's own data
    // round-tripped back, never a secret) so a real failure is diagnosable
    // from the ai_runs row alone.
    await admin.from('ai_runs').insert({
      owner_id: user.id,
      run_type: 'agent_plan',
      input_summary: inputSummary,
      output_summary: {
        error: 'schema_validation_failed',
        zod_issues: parseResult.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
        raw_tool_input: toolUseBlock.input,
      },
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status: 'failed',
      idempotency_key: idempotencyKey,
    })
    return new Response(JSON.stringify({ error: 'Réponse IA mal formée.' }), { status: 502 })
  }

  const output: PlanGenerateOutput = parseResult.data

  // Hard guardrail, enforced server-side: any send_message step MUST have a
  // non-empty message_text — never persist/return a step that would let the
  // UI show an empty "Lire le message". If the model somehow violated this
  // despite the schema/prompt, downgrade that step to log_note rather than
  // silently allow a blank outbound message to be reviewable/sendable.
  const sanitizedSteps = output.steps.map((step) => {
    if (step.step_type === 'send_message' && !step.message_text?.trim()) {
      return { ...step, step_type: 'log_note' as const, target_channel: null, recipient: null }
    }
    return step
  })
  const sanitizedOutput: PlanGenerateOutput = { ...output, steps: sanitizedSteps }

  const { data: aiRun, error: aiRunError } = await admin
    .from('ai_runs')
    .insert({
      owner_id: user.id,
      run_type: 'agent_plan',
      input_summary: inputSummary,
      output_summary: {
        step_count: sanitizedSteps.length,
        step_types: sanitizedSteps.map((s) => s.step_type),
      },
      model_id: MODEL_ID,
      prompt_version: PROMPT_VERSION,
      duration_ms: Date.now() - startedAt,
      status: 'completed',
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()

  if (aiRunError || !aiRun) {
    // A genuine race (two near-simultaneous calls both passing the pre-check
    // above before either had inserted) hits ai_runs.idempotency_key's real
    // unique constraint here (Postgres error code 23505) — rather than
    // surfacing that as a generic 500, look up the row the OTHER call just
    // won and return its linked plan, so the loser of the race still gets a
    // correct, usable response instead of an error for what is, from the
    // artisan's perspective, a perfectly normal double-tap.
    if (aiRunError?.code === '23505') {
      const { data: winningRun } = await admin
        .from('ai_runs')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .single()
      if (winningRun) {
        const { data: winningPlan } = await admin
          .from('agent_action_plans')
          .select('id, plan_steps, status, created_at')
          .eq('ai_run_id', winningRun.id)
          .maybeSingle()
        if (winningPlan) {
          return new Response(JSON.stringify(winningPlan), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }
    return new Response(JSON.stringify({ error: 'Échec de l’enregistrement du plan.' }), {
      status: 500,
    })
  }

  // Per §2.3: "the Edge Function's only job is to write the response into
  // agent_action_plans.plan_steps with status='proposed'" — nothing executes here.
  const { data: plan, error: planError } = await admin
    .from('agent_action_plans')
    .insert({
      owner_id: user.id,
      ai_run_id: aiRun.id,
      source_utterance: sourceUtterance,
      detected_intent: detectedIntent,
      matched_client_id: matchedClientId,
      matched_project_id: matchedProjectId,
      match_confidence: null,
      plan_steps: sanitizedOutput,
      status: 'proposed',
    })
    .select('id, plan_steps, status, created_at')
    .single()

  if (planError || !plan) {
    return new Response(JSON.stringify({ error: 'Échec de la création du plan.' }), { status: 500 })
  }

  return new Response(JSON.stringify(plan), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}))
