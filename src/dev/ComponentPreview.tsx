import * as React from 'react'
import { Bell, FileText, Wrench } from 'lucide-react'
import {
  AgentDictationRings,
  AgentResponseBubble,
  AgentSurface,
  AgentUserBubble,
  IntentConfirmationChip,
  PlanReviewCard,
} from '@/components/ui/AgentSurface'
import {
  Badge,
  ChantierStatusBadge,
  DunningLevelBadge,
  QuoteStatusBadge,
  StockStateBadge,
} from '@/components/ui/Badge'
import { BottomTabNav } from '@/components/ui/BottomTabNav'
import { Button } from '@/components/ui/Button'
import { Card, ContextualActionCard } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input, MoneyInput } from '@/components/ui/Input'
import { JournalTimeline, type JournalEntry } from '@/components/ui/JournalTimeline'
import { MarginBox } from '@/components/ui/MarginBox'
import { SendGuardBanner } from '@/components/ui/SendGuardBanner'
import { SideNavRail } from '@/components/ui/SideNavRail'
import {
  Skeleton,
  SkeletonCard,
  SkeletonFormField,
  SkeletonRow,
  SkeletonStatTile,
} from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'

/**
 * Temporary dev-only preview route (Step 2.2) — NOT wired into the main app
 * nav. Renders every variant of every component built in Step 2 so the theme
 * can be visually cross-checked against docs/02_ThemeGuideline.md §6.
 * Route registered at /__dev/components in Step 4's router (dev-only guard).
 */

const SAMPLE_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: '1',
    type: 'sms',
    direction: 'outbound',
    title: 'Rappel envoyé pour facture DEV-0042',
    timestamp: '14:32',
  },
  {
    id: '2',
    type: 'appel',
    direction: 'inbound',
    title: 'M. Bernard a appelé au sujet du carrelage',
    timestamp: 'Hier',
  },
  {
    id: '3',
    type: 'devis',
    direction: 'outbound',
    title: 'Devis DEV-0041 émis et envoyé par email',
    timestamp: 'Lun.',
  },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-divider pb-10">
      <h2 className="text-[20px] font-extrabold text-text-hi">{title}</h2>
      {children}
    </section>
  )
}

export default function ComponentPreview() {
  const [removedStepIds, setRemovedStepIds] = React.useState<Set<string>>(new Set())
  const [navActive, setNavActive] = React.useState<
    'home' | 'planning' | 'devis' | 'clients' | 'profil'
  >('home')

  return (
    <div className="min-h-screen bg-page-bg p-6 pb-32">
      <h1 className="mb-8 font-serif text-[30px] font-black text-text-hi">
        Kōv — Component Preview
      </h1>

      <div className="flex flex-col gap-10">
        <Section title="Buttons (§6.1)">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="agent">Agent</Button>
            <Button variant="urgent">Urgent</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="icon" size="iconDefault" aria-label="Icon button">
              <Bell size={18} />
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </Section>

        <Section title="Cards (§6.2)">
          <Card>Standard card content.</Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ContextualActionCard
              accent="brand"
              icon={<FileText size={20} />}
              cardTitle="Devis Bernard sans réponse"
              subtitle="Émis il y a 4 jours"
              action={
                <Button variant="ghost" size="sm">
                  Voir
                </Button>
              }
            />
            <ContextualActionCard
              accent="urgence"
              icon={<Bell size={20} />}
              cardTitle="Facture en retard"
              subtitle="18 jours de retard"
              action={
                <Button variant="urgent" size="sm">
                  Relancer
                </Button>
              }
            />
            <ContextualActionCard
              accent="gold"
              icon={<Wrench size={20} />}
              cardTitle="Rapport du jour"
              subtitle="Chantier Rousseau"
            />
            <ContextualActionCard
              accent="success"
              icon={<FileText size={20} />}
              cardTitle="Paiement reçu"
              subtitle="Facture FAC-0012"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatTile value="12" label="Clients" />
            <StatTile value="47 200 €" label="CA cumulé" trend="up" />
            <StatTile value="3" label="Chantiers" trend="down" />
          </div>
        </Section>

        <Section title="Inputs (§6.3)">
          <div className="grid max-w-md grid-cols-1 gap-4">
            <Input label="Nom du client" placeholder="Jean Bernard" />
            <Input label="Email" helperText="Utilisé pour l'envoi du devis" />
            <Input label="Téléphone" error="Format invalide" defaultValue="abc" />
            <MoneyInput label="Prix de vente (€)" placeholder="0.00" />
          </div>
        </Section>

        <Section title="Badges (§6.4)">
          <div className="flex flex-wrap gap-2">
            <QuoteStatusBadge status="draft" />
            <QuoteStatusBadge status="issued" />
            <QuoteStatusBadge status="accepted" />
            <QuoteStatusBadge status="declined" />
            <QuoteStatusBadge status="expired_cancelled" />
          </div>
          <div className="flex flex-wrap gap-2">
            <ChantierStatusBadge status="planned" />
            <ChantierStatusBadge status="in_progress" />
            <ChantierStatusBadge status="awaiting_payment" />
            <ChantierStatusBadge status="closed" />
          </div>
          <div className="flex flex-wrap gap-2">
            <DunningLevelBadge level={1} />
            <DunningLevelBadge level={2} />
            <DunningLevelBadge level={3} />
          </div>
          <div className="flex flex-wrap gap-2">
            <StockStateBadge state="available" />
            <StockStateBadge state="in_transit" />
            <StockStateBadge state="out_of_stock" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">via l'agent</Badge>
          </div>
        </Section>

        <Section title="MarginBox — all four tiers (§6.6, §2.4) — flagship component">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MarginBox marginPct={35} />
            <MarginBox marginPct={25} />
            <MarginBox marginPct={15} />
            <MarginBox marginPct={-5} />
          </div>
          <p className="text-[12px] text-text-low">
            Boundary spot-check — exactly 30.0/20.0/10.0/0.0%:
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MarginBox marginPct={30.0} />
            <MarginBox marginPct={20.0} />
            <MarginBox marginPct={10.0} />
            <MarginBox marginPct={0.0} />
          </div>
          <p className="text-[12px] text-text-low">Extended variant (chantier profitability):</p>
          <MarginBox
            marginPct={29}
            extended={{
              plannedMarginPct: 37,
              remainingAmountLabel: 'Il te reste 4 200 € une fois tout payé.',
            }}
          />
        </Section>

        <Section title="Journal timeline (§6.10)">
          <Card className="max-w-md">
            <JournalTimeline entries={SAMPLE_JOURNAL_ENTRIES} />
          </Card>
          <Card className="max-w-md">
            <JournalTimeline entries={[]} />
          </Card>
        </Section>

        <Section title="Kōv Agent surface (§6.9)">
          <AgentSurface className="max-w-md rounded-lg p-4">
            <div className="flex flex-col gap-3">
              <AgentUserBubble>Il me manque le double vasque pour Bernard</AgentUserBubble>
              <AgentResponseBubble>
                <span className="font-serif italic">Tu parles du chantier Bernard ?</span>
              </AgentResponseBubble>
              <IntentConfirmationChip needsDisambiguation>
                Chantier Bernard — livraison
              </IntentConfirmationChip>
              <div className="relative h-16">
                <AgentDictationRings active />
              </div>
              <PlanReviewCard
                planSummary="Prévenir Bernard du retard de livraison et mettre à jour le chantier"
                steps={[
                  { id: 's1', description: 'SMS à M. Bernard : contretemps double vasque' },
                  { id: 's2', description: 'Ajouter une note chantier : retard livraison' },
                ]}
                removedStepIds={removedStepIds}
                onToggleStep={(id) =>
                  setRemovedStepIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
                onReadMessage={() => {}}
                onConfirm={() => {}}
                onCancel={() => {}}
              />
            </div>
          </AgentSurface>
        </Section>

        <Section title="Navigation (§6.5)">
          <p className="text-[12px] text-text-low">
            Desktop side-rail (also visible in the live layout below 1024px is hidden by design —
            resize the window to see BottomTabNav vs SideNavRail switch):
          </p>
          {/* BUG FIX: SideNavRail is `position: fixed` by design (it's meant to pin to the
              real viewport in production). A plain `overflow-hidden` wrapper does NOT
              contain a fixed-position descendant — the demo instance below was escaping
              this box entirely and covering/intercepting clicks on the rest of the page
              at desktop widths (found via a real Playwright click-interception failure
              during the Step 1-4 re-audit). `transform: translateZ(0)` (via the
              `will-change-transform` utility) on the wrapper creates a new CSS containing
              block, which DOES correctly contain `position: fixed` descendants — this
              isolates the demo without changing SideNavRail's real production behavior. */}
          <div className="relative h-64 w-full max-w-xs origin-top-left overflow-hidden rounded-md border border-divider will-change-transform">
            <SideNavRail
              activeId={navActive}
              onSelect={setNavActive}
              onFabClick={() => {}}
              planningHasConflict
            />
          </div>
        </Section>

        <Section title="App-wide states (Step 3 — Skeleton / EmptyState / InlineError / SendGuardBanner)">
          <p className="text-[12px] text-text-low">
            Skeleton primitives (base, row, card, stat-tile, form-field):
          </p>
          <div className="flex flex-col gap-3 max-w-md">
            <Skeleton className="h-8 w-1/2" />
            <SkeletonRow hasAvatar hasAction />
            <SkeletonCard lines={2} />
            <div className="grid grid-cols-3 gap-2">
              <SkeletonStatTile />
              <SkeletonStatTile />
              <SkeletonStatTile />
            </div>
            <SkeletonFormField hasHelper />
          </div>

          <p className="text-[12px] text-text-low">EmptyState:</p>
          <Card className="max-w-md">
            <EmptyState
              icon={<FileText size={32} />}
              heading="Aucun devis pour l'instant"
              description="Crée ton premier devis pour commencer."
              actionLabel="Nouveau devis"
              onAction={() => {}}
            />
          </Card>

          <p className="text-[12px] text-text-low">InlineError (recoverable, local to section):</p>
          <div className="max-w-md">
            <InlineError onRetry={() => {}} />
          </div>

          <p className="text-[12px] text-text-low">SendGuardBanner (primary + agent variant):</p>
          <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <Card>
              <SendGuardBanner variant="primary" onConfirm={() => {}} onCancel={() => {}} />
            </Card>
            <Card>
              <SendGuardBanner variant="agent" onConfirm={() => {}} onCancel={() => {}} />
            </Card>
          </div>

          <p className="text-[12px] text-text-low">
            OfflineBanner is mounted at the app root (top of this page) — toggle Chrome DevTools
            "Offline" to see it appear/disappear; it must NOT trigger on Slow 3G throttling.
          </p>
        </Section>
      </div>

      <BottomTabNav
        activeId={navActive}
        onSelect={setNavActive}
        onFabClick={() => {}}
        planningHasConflict
      />
    </div>
  )
}
