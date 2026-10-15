import * as React from 'react'
import { FileText, Mail, MessageSquare, Mic, Phone, Receipt, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Kōv main courante / journal timeline — docs/02_ThemeGuideline.md §6.10
 * (module 6.11). Vertical, most-recent-first, connected by a thin rule.
 * Inbound/outbound visual distinction is a NAMED REQUIREMENT (Cahier §6.11),
 * not optional polish — never merge the two directions' styling.
 */

export type JournalEntryType =
  | 'sms'
  | 'email'
  | 'recommande'
  | 'appel'
  | 'rapport'
  | 'devis'
  | 'facture'
  | 'note'
  | 'agent_message'

export type JournalDirection = 'inbound' | 'outbound'

export interface JournalEntry {
  id: string
  type: JournalEntryType
  direction: JournalDirection
  title: string
  timestamp: string
  onExpand?: () => void
}

const entryIcon: Record<JournalEntryType, React.ReactNode> = {
  sms: <MessageSquare size={14} strokeWidth={1.75} />,
  email: <Mail size={14} strokeWidth={1.75} />,
  recommande: <Mail size={14} strokeWidth={1.75} />,
  appel: <Phone size={14} strokeWidth={1.75} />,
  rapport: <Mic size={14} strokeWidth={1.75} />,
  devis: <FileText size={14} strokeWidth={1.75} />,
  facture: <Receipt size={14} strokeWidth={1.75} />,
  note: <StickyNote size={14} strokeWidth={1.75} />,
  agent_message: <MessageSquare size={14} strokeWidth={1.75} />,
}

export interface JournalTimelineProps extends React.ComponentProps<'div'> {
  entries: JournalEntry[]
  emptyLabel?: string
}

/**
 * Reused (per-thread, at thread-summary granularity) by the cross-client
 * Messages screen — see docs/04_ApplicationFlow.md §2.13.
 */
function JournalTimeline({ entries, emptyLabel, className, ...props }: JournalTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className={cn('py-8 text-center text-[13px] text-text-low', className)} {...props}>
        {emptyLabel ?? 'Aucun échange pour l’instant.'}
      </div>
    )
  }

  return (
    <div
      data-slot="journal-timeline"
      className={cn('relative flex flex-col gap-3', className)}
      {...props}
    >
      <div className="absolute top-2 bottom-2 left-[15px] w-px bg-divider" aria-hidden="true" />
      {entries.map((entry) => (
        <JournalTimelineRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function JournalTimelineRow({ entry }: { entry: JournalEntry }) {
  const isInbound = entry.direction === 'inbound'
  return (
    <button
      type="button"
      onClick={entry.onExpand}
      className="relative flex items-start gap-3 rounded-xs pl-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      data-direction={entry.direction}
    >
      <span
        className={cn(
          'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isInbound ? 'bg-info-bg text-info-text' : 'bg-brand-100 text-brand-700',
        )}
      >
        {entryIcon[entry.type]}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="line-clamp-2 text-[12px] leading-[1.45] font-medium text-text-hi">
          {entry.title}
        </p>
      </div>
      <span className="shrink-0 pt-1 text-[9px] leading-[1.3] font-bold text-text-low whitespace-nowrap">
        {entry.timestamp}
      </span>
    </button>
  )
}

export { JournalTimeline }
