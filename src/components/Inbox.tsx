import { useEffect, useMemo, useRef, useState } from 'react'
import { Lightbulb, Music, Rewind, FastForward, Sparkles, Trash2, Undo2, ChevronsDown, Play, Pause } from 'lucide-react'
import { prefetch } from '../lib/audioCache'
import { clock, recordedLabel } from '../lib/format'
import { inboxQueue, sameSitting, songIndex, suggestSongs } from '../lib/library'
import { load, loudestAt, pause, seek, skipBy, toggle, usePlayer } from '../lib/player'
import { addToSong, createSong, deleteSong, updateSong, getState, library, removeFromSong, setSkipped, updateTake, useStore } from '../lib/store'
import { DEFAULT_STATUS, type Kind, type Status, type Take } from '../lib/types'
import { BottomSheet } from './BottomSheet'
import { NEW_SONG, SongPicker, StatusPicker, TagPicker } from './SortFields'
import { Waveform } from './Waveform'

type Choice = 'song' | 'idea' | 'binned' | 'skip'

interface Decision {
  take: Take
  choice: Choice
}

const PREFETCH = 25
const THRESHOLD = 90

export function Inbox({ onOpen }: { onOpen: (id: string) => void }) {
  const skipped = useStore((s) => s.skipped)
  const takes = useStore((s) => library(s).takes)
  const queue = useMemo(() => inboxQueue({ takes, tags: {}, markers: {}, songs: {} }, skipped), [takes, skipped])
  const quickSort = useStore((s) => s.quickSort)
  const [history, setHistory] = useState<Decision[]>([])
  const [sorting, setSorting] = useState<Take | null>(null)
  const top = queue[0]

  // Keep the next cards downloaded so sorting works without signal.
  const prefetchKey = queue.slice(0, PREFETCH).map((t) => t.id).join(',')
  useEffect(() => {
    void prefetch(queue.slice(0, PREFETCH))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchKey])

  // Load the top card; it plays once the person has tapped anything (autoplay rules).
  const touched = useRef(false)
  useEffect(() => {
    if (!top || sorting) return
    void load(top, { autoplay: touched.current })
  }, [top?.id, sorting]) // eslint-disable-line react-hooks/exhaustive-deps

  function decide(choice: Choice) {
    if (!top) return
    touched.current = true
    const take = top
    setHistory((h) => [...h.slice(-49), { take, choice }])
    if (choice === 'skip') {
      setSkipped([...getState().skipped.filter((id) => id !== take.id), take.id])
      return
    }
    const data: Partial<Take> = { kind: choice as Kind, sorted_at: new Date().toISOString() }
    updateTake(take.id, data)
    setSkipped(getState().skipped.filter((id) => id !== take.id))
    if (choice !== 'binned' && !quickSort) {
      pause()
      setSorting({ ...take, ...data })
    }
  }

  function undo() {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    const { take, choice } = last
    if (choice === 'skip') {
      setSkipped(getState().skipped.filter((id) => id !== take.id))
    } else {
      updateTake(take.id, { kind: 'inbox', status: take.status, tags: take.tags, notes: take.notes, title: take.title, sorted_at: take.sorted_at })
      // Take it back out of the song it went into, and drop the song if it was made just for it.
      const song = songIndex(library()).get(take.id)
      if (song) {
        if (song.takes.length === 1) deleteSong(song.id)
        else removeFromSong(song.id, take.id)
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-1 items-stretch justify-center px-4 pt-2 pb-3">
        {top ? (
          <>
            {queue[1] && <div className="absolute inset-x-7 top-5 bottom-5 rotate-2 rounded-[26px] border-[1.5px] border-outline bg-surface-variant" aria-hidden />}
            <SwipeCard key={top.id} take={top} onDecide={decide} onTouch={() => (touched.current = true)} onOpen={() => onOpen(top.id)} />
          </>
        ) : (
          <EmptyInbox />
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-3">
        <p className="text-center text-xs text-ink-variant">
          {top ? `${queue.length} to sort · → song · ← idea · ↑ bin · ↓ skip` : ' '}
        </p>
        <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
          <button type="button" className="btn-tonal py-3.5" disabled={!top} onClick={() => decide('idea')}>
            <Lightbulb size={18} /> Idea
          </button>
          <button type="button" className="btn-icon h-12 w-12" aria-label="Bin" disabled={!top} onClick={() => decide('binned')}>
            <Trash2 size={18} />
          </button>
          <button type="button" className="btn-icon h-12 w-12" aria-label="Undo" disabled={!history.length} onClick={undo}>
            <Undo2 size={18} />
          </button>
          <button type="button" className="btn-icon h-12 w-12" aria-label="Skip for now" disabled={!top} onClick={() => decide('skip')}>
            <ChevronsDown size={18} />
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-second-container py-3.5 text-sm font-bold text-on-second-container transition active:opacity-80 disabled:opacity-40"
            disabled={!top}
            onClick={() => decide('song')}
          >
            Song <Music size={18} />
          </button>
        </div>
      </div>
      {sorting && <SortSheet take={sorting} onClose={() => setSorting(null)} />}
    </div>
  )
}

function SwipeCard({ take, onDecide, onTouch, onOpen }: { take: Take; onDecide: (c: Choice) => void; onTouch: () => void; onOpen: () => void }) {
  const playing = usePlayer((p) => p.takeId === take.id && p.playing)
  const time = usePlayer((p) => (p.takeId === take.id ? p.time : 0))
  const loading = usePlayer((p) => p.takeId === take.id && p.loading)
  const error = usePlayer((p) => (p.takeId === take.id ? p.error : ''))
  const duration = take.duration || 0
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [leaving, setLeaving] = useState<Choice | null>(null)
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const dir: Choice | null =
    Math.abs(drag.x) > Math.abs(drag.y)
      ? drag.x > THRESHOLD ? 'song' : drag.x < -THRESHOLD ? 'idea' : null
      : drag.y < -THRESHOLD ? 'binned' : drag.y > THRESHOLD ? 'skip' : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      const map: Record<string, Choice> = { ArrowRight: 'song', ArrowLeft: 'idea', ArrowUp: 'binned', ArrowDown: 'skip' }
      if (map[e.key]) {
        e.preventDefault()
        fly(map[e.key])
      } else if (e.key === ' ') {
        e.preventDefault()
        onTouch()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function fly(choice: Choice) {
    setLeaving(choice)
    setTimeout(() => onDecide(choice), 170)
  }

  const offset = leaving
    ? { song: 'translate(140%, 0) rotate(18deg)', idea: 'translate(-140%, 0) rotate(-18deg)', binned: 'translate(0, -140%)', skip: 'translate(0, 120%)' }[leaving]
    : `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 20}deg)`

  const stamp = leaving ?? dir
  const stampText = { song: 'SONG', idea: 'IDEA', binned: 'BIN', skip: 'LATER' } as const
  const stampClass = { song: 'text-second border-second rotate-[10deg] right-4', idea: 'text-accent border-accent -rotate-[10deg] left-4', binned: 'text-error border-error left-1/2 -translate-x-1/2', skip: 'text-ink-variant border-ink-variant left-1/2 -translate-x-1/2' }

  return (
    <div
      className="sticker relative z-10 flex w-full max-w-md touch-none flex-col gap-4 rounded-[26px] bg-surface p-5 select-none"
      style={{
        transform: offset,
        transition: drag.active ? 'none' : 'transform 0.18s ease-out',
        opacity: leaving ? 0 : 1,
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button,[role=slider]')) return
        onTouch()
        start.current = { x: e.clientX, y: e.clientY, moved: false }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        setDrag({ x: 0, y: 0, active: true })
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const x = e.clientX - start.current.x
        const y = e.clientY - start.current.y
        if (Math.abs(x) + Math.abs(y) > 8) start.current.moved = true
        setDrag({ x, y, active: true })
      }}
      onPointerUp={() => {
        // Taps on the card's buttons never started a drag; they handle themselves.
        if (!start.current) return
        const moved = start.current.moved
        start.current = null
        if (dir) fly(dir)
        else setDrag({ x: 0, y: 0, active: false })
        if (!moved) toggle()
      }}
      onPointerCancel={() => {
        start.current = null
        setDrag({ x: 0, y: 0, active: false })
      }}
    >
      {stamp && (
        <span className={`pointer-events-none absolute top-5 rounded-lg border-[3px] bg-surface px-2.5 py-0.5 text-lg font-extrabold tracking-wider ${stampClass[stamp]}`}>
          {stampText[stamp]}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-ink-variant">{recordedLabel(take.recorded_at)}</span>
        <button type="button" onClick={onOpen} className="text-left font-display text-[28px] leading-tight font-semibold break-words text-ink">
          {take.title}
        </button>
        {take.source_path && <span className="truncate text-xs text-ink-variant" title={take.source_path}>{take.source_path}</span>}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3">
        <Waveform peaks={take.peaks} progress={duration ? time / duration : 0} bars={56} height={110} onSeek={(f) => seek(f * duration)} />
        <div className="flex items-center justify-between text-sm text-ink-variant tabular-nums">
          <span>{clock(time)}</span>
          <span>{error || (loading ? 'Loading…' : '')}</span>
          <span>{clock(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" className="btn-icon h-11 w-11" aria-label="Back 15 seconds" onClick={() => skipBy(-15)}>
          <Rewind size={18} />
        </button>
        <button type="button" className="fab h-16 w-16" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { onTouch(); toggle() }}>
          {playing ? <Pause size={26} /> : <Play size={26} className="ml-0.5" />}
        </button>
        <button type="button" className="btn-icon h-11 w-11" aria-label="Forward 15 seconds" onClick={() => skipBy(15)}>
          <FastForward size={18} />
        </button>
        {duration > 30 && (
          <button type="button" className="btn-icon h-11 w-11" aria-label="Jump to the loudest part" title="Jump to the loudest part" onClick={() => { onTouch(); seek(loudestAt(take)); if (!playing) toggle() }}>
            <Sparkles size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

function SortSheet({ take, onClose }: { take: Take; onClose: () => void }) {
  const lib = useStore((s) => library(s))
  const live = lib.takes[take.id] ?? take
  const isSong = live.kind === 'song'
  const [title, setTitle] = useState(live.title)
  const [notes, setNotes] = useState(live.notes)
  // Songs: start on the likeliest existing song only when it's a strong match (recorded in the same sitting).
  const [songId, setSongId] = useState(() => {
    const best = suggestSongs(lib, live, 1)[0]
    return best?.takes.some((id) => lib.takes[id] && sameSitting(lib.takes[id], live)) ? best.id : NEW_SONG
  })
  const [songTitle, setSongTitle] = useState(live.title)
  const [status, setStatus] = useState<Status | ''>(DEFAULT_STATUS)
  const existing = songId !== NEW_SONG ? lib.songs[songId] : undefined

  const close = () => {
    const patch: Partial<Take> = {}
    if (title.trim() && title.trim() !== live.title) patch.title = title.trim()
    if (notes !== live.notes) patch.notes = notes
    if (Object.keys(patch).length) updateTake(take.id, patch)
    if (isSong) {
      if (existing) addToSong(existing.id, take.id)
      else createSong({ title: songTitle.trim() || title.trim() || live.title, status: status || DEFAULT_STATUS, takes: [take.id] })
    }
    onClose()
  }

  return (
    <BottomSheet
      isOpen
      onClose={close}
      title={isSong ? 'Which song is this?' : 'Sorted as an idea'}
      footer={
        <button type="button" className="btn-filled w-full" onClick={close}>
          Done, next take
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {isSong ? (
          <>
            <SongPicker take={live} value={songId} onChange={setSongId} />
            {existing ? (
              <div className="flex flex-col gap-1.5">
                <span className="label-section">{existing.title} is</span>
                <StatusPicker value={existing.status} onChange={(s) => updateSong(existing.id, { status: s })} />
                <p className="text-xs text-ink-variant">
                  This take goes in at #{existing.takes.filter((id) => lib.takes[id]?.kind !== 'binned' && id !== take.id).length + 1}. Rank takes on the song’s page.
                </p>
              </div>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="label-section">Song name</span>
                  <input id="sort-song-title" className="input-field" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="label-section">Status</span>
                  <StatusPicker value={status} onChange={setStatus} />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="label-section">Name</span>
              <input id="sort-title" className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="label-section">Tags</span>
              <TagPicker take={live} value={live.tags} onChange={(tags) => updateTake(take.id, { tags })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="label-section">Status</span>
              <StatusPicker optional value={live.status} onChange={(s) => updateTake(take.id, { status: s })} />
            </div>
          </>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="label-section">{isSong ? 'Notes on this take' : 'Notes'}</span>
          <textarea id="sort-notes" className="input-field min-h-24" placeholder={isSong ? 'Tempo, what worked, what didn’t…' : 'Capo, tuning, what to try next…'} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
    </BottomSheet>
  )
}

function EmptyInbox() {
  const lib = useStore((s) => library(s))
  const loaded = useStore((s) => s.loaded)
  const syncing = useStore((s) => s.syncing)
  const any = Object.keys(lib.takes).length > 0
  return (
    <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center">
      <span className="text-5xl" aria-hidden>📼</span>
      <h2 className="heading-section">{any ? 'Inbox clear' : loaded && !syncing ? 'No takes yet' : 'Loading takes…'}</h2>
      <p className="text-ink-variant">
        {any
          ? 'Everything’s sorted. New recordings show up here once they land in the demos folder on the NAS.'
          : 'Recordings appear here after the NAS picks them up from the demos folder. That can take up to 10 minutes after the files arrive.'}
      </p>
    </div>
  )
}
