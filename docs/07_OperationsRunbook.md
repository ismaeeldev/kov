# Kōv — Operations Runbook: Backup & Restore

> **Purpose**: docs/01_ScopeDocument.md KOV-FR-020 requires "backups" and "a documented restore test" as a support-level requirement. A full scope-compliance audit (2026-09-26) found this file didn't exist — this closes that gap with the REAL, currently-verified state of the project's backup capability, not an aspirational description of a feature that isn't actually enabled yet.
>
> **Update this file** whenever the project's Supabase plan tier, backup configuration, or the production/staging project topology changes (see Step 15 in `03_MasterPrompts.md` — production release is not yet underway; this document currently describes the one real Supabase project this codebase is connected to today).

---

## 1. Current backup status (verified 2026-09-26)

Checked via `supabase backups list` against the real, currently-linked project (`tgcxsfgzybdqzjlmmrkk`, referred to as `kov-app` elsewhere in this project's docs):

```json
{"region":"eu-west-1","walg_enabled":true,"pitr_enabled":false,"backups":[],"physical_backup_data":{},"message":""}
```

**What this means, honestly:**
- `walg_enabled: true` — the underlying WAL-G backup infrastructure Supabase uses is present at the platform level.
- **`pitr_enabled: false`** — Point-in-Time Recovery is **NOT currently enabled** on this project. PITR is a paid-plan feature (Pro plan and above, with an additional PITR add-on) — this project's current plan tier does not have it turned on.
- **`"backups": []`** — **zero physical backups currently exist** for this project via the CLI-visible mechanism above.
- This does **not** mean the project has no data-loss protection at all — Supabase's own platform-level daily backups (available on paid plans, retained for a plan-dependent window, restorable from the Dashboard's Database → Backups page) are a separate mechanism from the CLI's PITR-focused `backups` command and were not independently re-verified via the Dashboard UI as part of this pass (CLI access only, no interactive Dashboard session available in this environment).

**Action needed before this is a real, reliable safety net**: confirm the project's current Supabase plan tier in the Dashboard (Settings → Billing) and, if backups matter for real client data (they do, once this project holds a real client's live business data), either upgrade to a plan with daily backups + a defined retention window, or explicitly enable and budget for PITR. This is a plan/billing decision for the project owner, not something this codebase or an agent can enable unilaterally.

---

## 2. How to check current backup status yourself

```bash
supabase login   # if not already authenticated
supabase link --project-ref <project-ref>
supabase backups list
```

Look for:
- `pitr_enabled: true/false`
- A non-empty `backups` array, each entry with a `status` and timestamp

If `pitr_enabled: false` and `backups: []`, there is currently **no restorable backup** for this project through this command — check the Dashboard's Database → Backups page for the platform-level daily-backup status, which is plan-tier-dependent and not fully mirrored by this CLI command on every plan.

---

## 3. Restore procedure — PITR (once enabled)

This is the procedure to follow **once `pitr_enabled: true` and the plan supports it** — write this down now so it's ready, not improvised during an actual incident.

1. **Do not skip straight to restoring.** First confirm the actual scope of data loss/corruption — a PITR restore rolls the ENTIRE database back to a single point in time, affecting every table, every owner's data, not just the affected rows. Confirm with the team whether a more targeted fix (e.g. restoring a single accidentally-deleted row from a recent `pg_dump` if one exists, or reversing a bad migration) is possible first.
2. Identify the target restore timestamp — as precise as possible, ideally just before the incident (e.g. a bad migration, an accidental mass-delete, a compromised admin action).
3. Run:
   ```bash
   supabase backups restore --project-ref <project-ref> --timestamp "<ISO 8601 timestamp>"
   ```
   (Exact flag name/format to be confirmed against the CLI version in use at restore time — `supabase backups restore --help` — since CLI flags can change between versions; this project was last checked against Supabase CLI v2.116.0.)
4. **This creates a NEW project restored to that point in time** — it does not overwrite the existing project in place. Expect a new project ref/URL.
5. Before cutting the app over to the restored project:
   - Verify the restored data looks correct (spot-check a few real tables: `clients`, `quotes`, `invoices`).
   - Re-run the RLS isolation test (`tests/integration/rls-isolation.test.ts`) against the restored project to confirm RLS policies survived the restore intact — a restore is exactly the kind of operation that could silently drop a policy if something in the restore process didn't fully replay every migration.
   - Re-apply any Edge Function secrets (`ANTHROPIC_API_KEY`, `CRON_SECRET`, etc. — see `supabase secrets list` on the OLD project first to know what needs re-setting) and redeploy every Edge Function, since a database restore does not restore Edge Function deployments or their secrets.
   - Re-verify the `agent-plan-expiry-sweep` cron job (`supabase/migrations/0013_agent_plan_expiry_cron.sql`) is still scheduled — `select * from cron.job where jobname = 'agent-plan-expiry-sweep'` — since `pg_cron` jobs are themselves stored in the database and their behavior post-restore should be explicitly re-confirmed, not assumed.
6. Update `.env.local` (and, once Step 15/production exists, the real Vercel environment variables) to point at the restored project's URL/keys.
7. Document the incident: what happened, the restore timestamp used, what (if anything) was lost between the incident and the restore point, and who was notified.

---

## 4. Restore procedure — Dashboard daily backup (if PITR isn't enabled but daily backups are)

1. Log into the Supabase Dashboard → the project → Database → Backups.
2. Select the most recent backup taken before the incident.
3. Follow the Dashboard's own restore flow (this typically also creates a new project, not an in-place overwrite — confirm the exact behavior shown in the Dashboard UI at restore time, since Supabase's own restore UX has changed across versions).
4. Follow the same post-restore verification steps as §3 step 5 above (RLS test, secrets, Edge Functions, cron job) regardless of which restore mechanism was used.

---

## 5. What this runbook does NOT yet cover (honest gaps)

- **A real, end-to-end restore has not actually been performed and tested against this project** — this document describes the procedure as understood from Supabase's own CLI/Dashboard surface, not a verified dry-run. `01_ScopeDocument.md`'s NFR table asks for "a documented and tested restore procedure" — the "documented" half is now done; the "tested" half requires either (a) a deliberate dry-run against a disposable duplicate project once PITR/backups are actually enabled, or (b) waiting until a real incident, which is not the recommended way to first test this. Recommend scheduling a deliberate restore drill once Step 15 (Production Release) is underway and a production project exists to test against, rather than practicing against the one real project currently holding development data.
- **Export-on-request (a GDPR-style "give me my data" export) is a separate, still-unimplemented feature** — this runbook is about disaster-recovery restore, not the account-holder-initiated data export named elsewhere in KOV-FR-020. That gap is tracked separately.
