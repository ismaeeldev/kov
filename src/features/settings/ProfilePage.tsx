import * as React from 'react'
import {
  Banknote,
  Building2,
  ChevronRight,
  Download,
  FileText,
  FolderInput,
  LogOut,
  Receipt,
  Shield,
  SmilePlus,
  Trash2,
  User,
  Wrench,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useOwnerRecord } from '@/hooks/useOwnerRecord'

/**
 * Profil menu (/profile) — docs/04_ApplicationFlow.md §2.20. Entry point to
 * every secondary function (business/price-library/technical-sheets/
 * accounting-export/migration/financing/satisfaction/team — team is reached
 * via Business settings per its own back-link, not listed here directly) plus
 * account-level actions (sign out, account deletion).
 */

const MENU_ITEMS = [
  { to: '/profile/business', icon: Building2, label: 'Entreprise & Coordonnées', desc: 'SIRET, TVA, adresse et mentions légales' },
  { to: '/profile/price-library', icon: Wrench, label: 'Bibliothèque de prix', desc: 'Ouvrages, fournitures et main d’œuvre' },
  { to: '/profile/technical-sheets', icon: FileText, label: 'Fiches techniques', desc: 'Documentation matériaux et normes' },
  { to: '/profile/accounting-export', icon: Receipt, label: 'Export comptable', desc: 'Fichier FEC, listing des ventes et achats' },
  { to: '/profile/migration', icon: FolderInput, label: 'Reprendre mes données', desc: 'Import CSV et archives de logiciels tiers' },
  { to: '/profile/financing', icon: Banknote, label: 'Financement client', desc: 'Simulations de crédit et paiement échelonné' },
  { to: '/profile/satisfaction', icon: SmilePlus, label: 'Satisfaction client', desc: 'Relances de satisfaction et suivi post-chantier' },
] as const

type DeleteStage = 'idle' | 'confirm' | 'deleting' | 'error'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const { business, isLoading } = useOwnerRecord()
  const [deleteStage, setDeleteStage] = React.useState<DeleteStage>('idle')
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [signOutError, setSignOutError] = React.useState<string | null>(null)
  const [exportStatus, setExportStatus] = React.useState<'idle' | 'exporting' | 'error'>('idle')
  const [exportError, setExportError] = React.useState<string | null>(null)
  // Refs, not state checks — a state-only guard doesn't actually prevent a
  // genuine same-tick double-click (React batches setState; a second click
  // handler invoked before the first's update commits can still read the
  // stale value and pass the check too — see SatisfactionPage.tsx's doc
  // comment, module 15 deep audit, 2026-10-08, for the full story). Found
  // missing here too on re-read (module 19 deep audit, 2026-10-08) —
  // `deletingRef` guards the single highest-stakes action in the app
  // (irreversible account deletion), so this is worth hardening even though
  // the delete-account Edge Function is presumably idempotent.
  const exportingRef = React.useRef(false)
  const deletingRef = React.useRef(false)

  async function handleSignOut() {
    setSignOutError(null)
    const { error } = await supabase.auth.signOut()
    if (error) setSignOutError(error.message)
  }

  async function handleExportData() {
    if (exportingRef.current) return
    exportingRef.current = true
    setExportStatus('exporting')
    setExportError(null)
    try {
      const { data, error } = await apiWrite((client) =>
        client.functions.invoke('export-personal-data'),
      )
      if (error) {
        exportingRef.current = false
        setExportStatus('error')
        setExportError("L'export a échoué. Réessaie, ou contacte le support si le problème persiste.")
        return
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `kov-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      exportingRef.current = false
      setExportStatus('idle')
    } catch (err) {
      exportingRef.current = false
      setExportStatus('error')
      setExportError(
        err instanceof ApiTimeoutError
          ? err.message
          : "L'export a échoué. Réessaie, ou contacte le support si le problème persiste.",
      )
    }
  }

  async function handleConfirmDelete() {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleteStage('deleting')
    setDeleteError(null)
    try {
      const { error } = await apiWrite((client) => client.functions.invoke('delete-account'))
      if (error) {
        deletingRef.current = false
        setDeleteStage('error')
        setDeleteError(
          'La suppression du compte a échoué. Réessaie, ou contacte le support si le problème persiste.',
        )
        return
      }
      await supabase.auth.signOut()
      navigate('/sign-in', { replace: true })
    } catch (err) {
      deletingRef.current = false
      setDeleteStage('error')
      setDeleteError(
        err instanceof ApiTimeoutError
          ? err.message
          : 'La suppression du compte a échoué. Réessaie, ou contacte le support si le problème persiste.',
      )
    }
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(isLoading)

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6 lg:p-8">
        <div className="mb-6 rounded-md border border-divider/30 bg-surface/90 p-5 sm:p-6 shadow-raised">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              <Skeleton className="h-7 w-48 rounded-xs" />
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-32 rounded-xs" />
                <Skeleton className="h-4 w-28 rounded-pill" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-sm border border-divider/30 bg-surface/80 p-4 shadow-flat"
            >
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-sm" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-44 rounded-xs" />
                  <Skeleton className="h-3 w-60 rounded-xs opacity-65" />
                </div>
              </div>
              <Skeleton className="h-4 w-4 rounded-xs opacity-40" />
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="h-11 w-full rounded-sm" />
          <Skeleton className="h-11 w-full rounded-sm" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6 lg:p-8">
      {/* Identity Card */}
      <div className="mb-6 rounded-md border border-divider/30 bg-surface/90 p-5 sm:p-6 shadow-raised backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-brand-500/15 text-brand-300 font-serif text-xl font-black border border-brand-500/30">
            {business?.legal_name ? business.legal_name.slice(0, 2).toUpperCase() : <User size={24} />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[22px] sm:text-[26px] font-black tracking-tight text-text-hi truncate">
              {business?.legal_name || 'Mon profil artisan'}
            </h1>
            <p className="text-[13px] font-medium text-text-mid truncate">
              {user?.email || 'Compte Kōv'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Settings Navigation */}
      <div className="mb-8">
        <h2 className="mb-3 px-1 text-[11px] font-black tracking-[0.06em] text-text-low uppercase">
          Paramètres & Gestion
        </h2>
        <ul className="flex flex-col gap-2.5">
          {MENU_ITEMS.map(({ to, icon: Icon, label, desc }) => (
            <li key={to}>
              <button
                type="button"
                onClick={() => navigate(to)}
                className="group flex w-full items-center gap-3.5 rounded-md border border-divider/30 bg-surface/90 p-4 text-left shadow-raised backdrop-blur-md transition-all hover:border-brand-500/50 hover:shadow-floating outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-brand-500/10 text-brand-300 group-hover:bg-brand-500/20 transition-colors border border-brand-500/20">
                  <Icon size={19} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-extrabold text-text-hi group-hover:text-brand-300 transition-colors">
                    {label}
                  </div>
                  <div className="text-[12px] text-text-mid truncate">
                    {desc}
                  </div>
                </div>
                <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-text-low group-hover:translate-x-1 group-hover:text-brand-300 transition-transform" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Account actions */}
      <div className="rounded-md border border-divider/30 bg-surface/90 p-5 shadow-raised backdrop-blur-md flex flex-col gap-3">
        <h2 className="text-[11px] font-black tracking-[0.06em] text-text-low uppercase flex items-center gap-1.5">
          <Shield size={13} strokeWidth={2} className="text-brand-300" />
          Sécurité & Données
        </h2>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            variant="ghost"
            className="justify-start gap-3 text-text-hi font-bold text-[13px] hover:bg-recessed"
            onClick={handleSignOut}
          >
            <LogOut size={17} strokeWidth={2} className="text-text-mid" />
            Se déconnecter
          </Button>
          {signOutError ? <InlineError message={signOutError} onRetry={handleSignOut} /> : null}

          <Button
            variant="ghost"
            className="justify-start gap-3 text-text-hi font-bold text-[13px] hover:bg-recessed"
            disabled={exportStatus === 'exporting' || !isOnline}
            onClick={handleExportData}
          >
            <Download size={17} strokeWidth={2} className="text-text-mid" />
            {exportStatus === 'exporting' ? 'Exportation en cours...' : 'Exporter toutes mes données (RGPD)'}
          </Button>
          {exportStatus === 'error' && exportError ? (
            <InlineError message={exportError} onRetry={handleExportData} />
          ) : null}

          <div className="border-t border-divider/20 my-1" />

          <Button
            variant="ghost"
            className="justify-start gap-3 text-error-text font-bold text-[13px] hover:bg-error-bg/15"
            onClick={() => {
              setDeleteError(null)
              setDeleteStage('confirm')
            }}
          >
            <Trash2 size={17} strokeWidth={2} />
            Supprimer définitivement mon compte
          </Button>
        </div>
      </div>

      {deleteStage !== 'idle' ? (
        <Modal
          onClose={() => setDeleteStage('idle')}
          labelledBy="delete-account-modal-title"
          panelClassName="max-w-md gap-4 p-6"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10 text-error-text mb-1">
            <Trash2 size={24} strokeWidth={2} />
          </div>

          <div>
            <h2
              id="delete-account-modal-title"
              className="font-serif text-[20px] font-black text-text-hi"
            >
              Supprimer définitivement ton compte ?
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-text-mid">
              Cette action est irréversible. Tous tes clients, devis, chantiers, factures et documents
              seront définitivement effacés conformément aux règles de confidentialité.
            </p>
          </div>

          {deleteStage === 'deleting' ? (
            <p className="text-[13px] font-bold text-text-hi">Suppression en cours...</p>
          ) : null}

          {deleteStage === 'error' && deleteError ? (
            <InlineError message={deleteError} onRetry={handleConfirmDelete} />
          ) : null}

          <div className="mt-3 flex gap-2.5">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 border border-divider/60 font-bold"
              disabled={deleteStage === 'deleting'}
              onClick={() => setDeleteStage('idle')}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1 bg-error text-white hover:bg-error/90 font-bold shadow-sm"
              disabled={deleteStage === 'deleting' || !isOnline}
              onClick={handleConfirmDelete}
            >
              {deleteStage === 'deleting' ? 'Suppression...' : 'Confirmer la suppression'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

