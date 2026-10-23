import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cacheStats, clearCache } from '../lib/audioCache'
import { bySortedDesc, counts } from '../lib/library'
import { signOut } from '../lib/pb'
import { forgetLocal, library, setQuickSort, signedOut, sync, updateTake, useStore } from '../lib/store'
import { BottomSheet } from './BottomSheet'
import { TakeRow } from './Library'

export function Menu({ isOpen, onClose, onOpen }: { isOpen: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const email = useStore((s) => s.email)
  const queue = useStore((s) => s.queue.length)
  const syncing = useStore((s) => s.syncing)
  const reachable = useStore((s) => s.reachable)
  const lastError = useStore((s) => s.lastError)
  const quickSort = useStore((s) => s.quickSort)
  const lib = useStore((s) => library(s))
  const c = counts(lib)
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null)
  const [showBinned, setShowBinned] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    if (isOpen) void cacheStats().then(setStats)
  }, [isOpen])

  const binned = Object.values(lib.takes).filter((t) => t.kind === 'binned').sort(bySortedDesc)

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={showBinned ? 'Binned' : 'Takes'}>
      {showBinned ? (
        <div className="flex flex-col gap-3">
          <button type="button" className="btn-outlined self-start" onClick={() => setShowBinned(false)}>
            Back
          </button>
          {binned.length === 0 && <p className="text-ink-variant">Nothing in the bin.</p>}
          <ul className="card divide-y-[1.5px] divide-outline overflow-hidden">
            {binned.map((t) => (
              <li key={t.id} className="flex items-center">
                <div className="min-w-0 flex-1">
                  <TakeRow take={t} onOpen={() => { onClose(); onOpen(t.id) }} />
                </div>
                <button type="button" className="mr-3 shrink-0 text-sm font-bold text-accent" onClick={() => updateTake(t.id, { kind: 'inbox' })}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-semibold">{!reachable ? 'Offline' : syncing ? 'Syncing…' : queue ? 'Changes waiting' : 'Up to date'}</span>
                <span className="text-sm text-ink-variant">
                  {queue ? `${queue} change${queue > 1 ? 's' : ''} saved on this phone, sent when the NAS is reachable.` : 'Everything is saved on the NAS.'}
                </span>
              </div>
              <button type="button" className="btn-icon" aria-label="Sync now" onClick={() => void sync({ full: true })}>
                <RefreshCw size={17} className={syncing ? 'animate-spin' : ''} />
              </button>
            </div>
            {!reachable && lastError && <p className="text-xs break-all text-ink-variant">{lastError}</p>}
            <p className="text-sm text-ink-variant tabular-nums">
              {c.inbox} in the inbox · {c.songs} songs ({c.song} takes) · {c.idea} ideas
            </p>
          </div>

          <label className="flex items-start justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-semibold">Quick sort</span>
              <span className="text-sm text-ink-variant">Skip the name, status and notes sheet after each swipe.</span>
            </span>
            <input id="quick-sort" type="checkbox" className="mt-1 h-5 w-5 accent-accent" checked={quickSort} onChange={(e) => setQuickSort(e.target.checked)} />
          </label>

          <button type="button" className="flex items-center justify-between text-left" onClick={() => setShowBinned(true)}>
            <span className="flex flex-col">
              <span className="font-semibold">Binned takes</span>
              <span className="text-sm text-ink-variant">Hidden, not deleted. The originals stay on the NAS.</span>
            </span>
            <span className="count-badge">{c.binned}</span>
          </button>

          <div className="flex items-start justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-semibold">Downloaded audio</span>
              <span className="text-sm text-ink-variant">
                {stats ? `${stats.count} takes kept on this phone for offline listening${stats.bytes >= 1e6 ? `, about ${Math.round(stats.bytes / 1e6)} MB` : ''}.` : '…'}
              </span>
            </span>
            <button type="button" className="btn-outlined shrink-0 px-4 py-2" onClick={() => void clearCache().then(() => cacheStats().then(setStats))}>
              Clear
            </button>
          </div>

          <div className="flex flex-col gap-2 border-t-[1.5px] border-outline pt-4">
            <span className="text-sm text-ink-variant">Signed in as {email}</span>
            {confirmSignOut ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-error-container p-3 text-sm text-on-error-container">
                <span>{queue ? `${queue} change${queue > 1 ? 's' : ''} haven’t reached the NAS yet and will be lost. ` : ''}Signing out also removes the takes saved on this phone.</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-danger bg-surface" onClick={async () => { signOut(); await forgetLocal(); await clearCache(); signedOut(); onClose() }}>
                    Sign out
                  </button>
                  <button type="button" className="btn-outlined" onClick={() => setConfirmSignOut(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-outlined self-start" onClick={() => setConfirmSignOut(true)}>
                Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
