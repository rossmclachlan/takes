import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, GripVertical, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { clock, shortDate } from '../lib/format'
import { candidateTakes, songTakes } from '../lib/library'
import { load, toggle, usePlayer } from '../lib/player'
import { addToSong, deleteSong, library, mergeSongs, rankSong, removeFromSong, songNamed, updateSong, useStore } from '../lib/store'
import type { Song, Take } from '../lib/types'
import { BottomSheet } from './BottomSheet'
import { SearchBox } from './Library'
import { StatusPicker } from './SortFields'

export function SongPage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const lib = useStore((s) => library(s))
  const song = lib.songs[id]
  const takes = useMemo(() => (song ? songTakes(lib, song) : []), [lib, song])
  const [adding, setAdding] = useState(false)

  if (!song) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <button type="button" className="btn-outlined" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <p className="text-ink-variant">This song isn’t on this phone, or was deleted.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-1 pb-8">
      <div className="flex items-center justify-between">
        <button type="button" className="btn-icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm text-ink-variant">Song · {takes.length} take{takes.length === 1 ? '' : 's'}</span>
      </div>

      <TitleField key={song.title} song={song} />

      <DuplicateNotice song={song} />

      <StatusPicker value={song.status} onChange={(status) => updateSong(song.id, { status })} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label-section">Takes, best first</span>
          {takes.length > 1 && (
            <button type="button" className="text-xs font-bold text-accent" onClick={() => void load(takes[0], { autoplay: true, queue: takes.slice(1) })}>
              Play all
            </button>
          )}
        </div>
        {takes.length > 0 ? (
          <RankedTakes song={song} takes={takes} onOpen={onOpen} />
        ) : (
          <p className="text-sm text-ink-variant">No takes in this song yet.</p>
        )}
        {takes.length > 1 && <p className="text-xs text-ink-variant">Drag the handles to rank them. The top one plays first from the Songs list.</p>}
        <button type="button" className="btn-tonal self-start" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add takes
        </button>
      </div>

      <NotesField key={song.id} song={song} />

      <button
        type="button"
        className="btn-danger self-start"
        onClick={() => {
          if (confirm(`Delete “${song.title}”? Its takes stay, as ideas.`)) {
            deleteSong(song.id)
            onBack()
          }
        }}
      >
        <Trash2 size={16} /> Delete song
      </button>

      {adding && <AddTakesSheet song={song} onClose={() => setAdding(false)} />}
    </div>
  )
}

/** Drag a row by its handle to re-rank; the list reorders live and saves on release. */
function RankedTakes({ song, takes, onOpen }: { song: Song; takes: Take[]; onOpen: (id: string) => void }) {
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const slots = useRef<{ top: number; bottom: number }[]>([])
  const byId = useMemo(() => new Map(takes.map((t) => [t.id, t])), [takes])
  const order = drag?.order ?? takes.map((t) => t.id)

  const start = (id: string, e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    slots.current = takes.map((t) => {
      const r = rows.current.get(t.id)!.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    })
    setDrag({ id, order: takes.map((t) => t.id) })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const y = e.clientY
    let to = slots.current.findIndex((s) => y < (s.top + s.bottom) / 2)
    if (to === -1) to = slots.current.length - 1
    const rest = drag.order.filter((x) => x !== drag.id)
    const next = [...rest.slice(0, to), drag.id, ...rest.slice(to)]
    if (next.join() !== drag.order.join()) setDrag({ ...drag, order: next })
  }
  const end = () => {
    if (drag) rankSong(song.id, drag.order)
    setDrag(null)
  }

  return (
    <ol className="card divide-y-[1.5px] divide-outline overflow-hidden">
      {order.map((id, i) => {
        const take = byId.get(id)
        if (!take) return null
        return (
          <li
            key={id}
            ref={(el) => {
              if (el) rows.current.set(id, el)
              else rows.current.delete(id)
            }}
            className={drag?.id === id ? 'relative z-10 bg-surface-variant shadow-lg' : ''}
          >
            <RankRow
              take={take}
              rank={i + 1}
              queue={order.slice(i + 1).map((x) => byId.get(x)!).filter(Boolean)}
              onOpen={() => onOpen(take.id)}
              onRemove={() => removeFromSong(song.id, take.id)}
              handle={
                <button
                  type="button"
                  aria-label={`Move ${take.title}`}
                  className="flex h-10 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-ink-variant"
                  onPointerDown={(e) => start(id, e)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onKeyDown={(e) => {
                    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
                    if (to < 0 || to >= order.length) return
                    e.preventDefault()
                    const rest = order.filter((x) => x !== id)
                    rankSong(song.id, [...rest.slice(0, to), id, ...rest.slice(to)])
                  }}
                >
                  <GripVertical size={18} />
                </button>
              }
            />
          </li>
        )
      })}
    </ol>
  )
}

function RankRow({ take, rank, queue, onOpen, onRemove, handle }: { take: Take; rank: number; queue: Take[]; onOpen: () => void; onRemove: () => void; handle: React.ReactNode }) {
  const isCurrent = usePlayer((p) => p.takeId === take.id)
  const playing = usePlayer((p) => p.takeId === take.id && p.playing)
  const sub = [shortDate(take.recorded_at), take.kind === 'idea' ? 'idea' : '', take.notes ? `“${take.notes.split('\n')[0].slice(0, 50)}”` : ''].filter(Boolean)
  return (
    <div className={`flex items-center gap-2 py-2 pr-2 pl-1 ${isCurrent ? 'bg-accent-container/50' : ''}`}>
      {handle}
      <span className={`w-6 shrink-0 text-center text-sm font-extrabold tabular-nums ${rank === 1 ? 'text-ink' : 'text-ink-variant'}`}>{rank === 1 ? '★' : rank}</span>
      <button
        type="button"
        aria-label={playing ? `Pause ${take.title}` : `Play ${take.title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-sun text-ink"
        onClick={() => (isCurrent ? toggle() : void load(take, { autoplay: true, queue }))}
      >
        {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen}>
        <span className="truncate font-semibold text-ink">{take.title}</span>
        <span className="truncate text-xs text-ink-variant">{sub.join(' · ')}</span>
      </button>
      <span className="shrink-0 text-xs text-ink-variant tabular-nums">{clock(take.duration)}</span>
      <button type="button" className="btn-icon h-8 w-8 shrink-0" aria-label={`Take ${take.title} out of this song`} onClick={onRemove}>
        <X size={15} />
      </button>
    </div>
  )
}

/** Takes to add, recorded-nearby ones first. Adding one moves it out of any other song. */
function AddTakesSheet({ song, onClose }: { song: Song; onClose: () => void }) {
  const lib = useStore((s) => library(s))
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<string[]>([])
  // Keep the list steady while adding, so rows don't jump out from under a finger.
  const list = useMemo(() => candidateTakes(lib, { ...song, takes: song.takes.filter((t) => !added.includes(t)) }, query).slice(0, 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, song.id])
  const inSong = new Map<string, string>()
  for (const s of Object.values(lib.songs)) if (s.id !== song.id) for (const t of s.takes) inSong.set(t, s.title)

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title={`Add to ${song.title}`}
      footer={
        <button type="button" className="btn-filled w-full" onClick={onClose}>
          Done{added.length ? `, added ${added.length}` : ''}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search takes" />
        <ul className="card divide-y-[1.5px] divide-outline overflow-hidden">
          {list.map((t) => {
            const on = added.includes(t.id)
            const where = inSong.get(t.id)
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-ink">{t.title}</span>
                  <span className="truncate text-xs text-ink-variant">
                    {[shortDate(t.recorded_at), clock(t.duration), t.kind === 'inbox' ? 'inbox' : t.kind === 'idea' ? 'idea' : '', where && !on ? `in ${where}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <button
                  type="button"
                  className={`chip shrink-0 ${on ? 'chip-on' : ''}`}
                  onClick={() => {
                    if (on) {
                      removeFromSong(song.id, t.id)
                      setAdded(added.filter((x) => x !== t.id))
                    } else {
                      addToSong(song.id, t.id)
                      setAdded([...added, t.id])
                    }
                  }}
                >
                  {on ? 'Added' : where ? 'Move here' : 'Add'}
                </button>
              </li>
            )
          })}
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-variant">No takes match.</li>}
        </ul>
      </div>
    </BottomSheet>
  )
}

function TitleField({ song }: { song: Song }) {
  const [value, setValue] = useState(song.title)
  return (
    <textarea
      id="song-title"
      aria-label="Song name"
      rows={1}
      className="field-sizing-content resize-none rounded-xl bg-transparent px-1 font-display text-[30px] leading-tight font-semibold text-ink outline-none focus:bg-surface"
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        const v = value.trim()
        if (v && v !== song.title) updateSong(song.id, { title: v })
        else setValue(song.title)
      }}
    />
  )
}

function NotesField({ song }: { song: Song }) {
  const [value, setValue] = useState(song.notes)
  return (
    <label className="flex flex-col gap-2">
      <span className="label-section">Notes</span>
      <textarea
        id="song-notes"
        className="input-field field-sizing-content min-h-28"
        placeholder="Lyrics, structure, key, what to try next…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          updateSong(song.id, { notes: e.target.value })
        }}
      />
    </label>
  )
}

/** Another song with the same name: offer to fold it into this one. */
function DuplicateNotice({ song }: { song: Song }) {
  const lib = useStore((s) => library(s))
  const other = useMemo(() => songNamed(song.title, song.id), [lib, song.title, song.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!other) return null
  const count = other.takes.filter((id) => lib.takes[id] && lib.takes[id].kind !== 'binned').length
  return (
    <div className="card flex flex-col gap-2 p-3">
      <p className="text-sm text-ink">
        There’s another song called “{other.title}” with {count} take{count === 1 ? '' : 's'}.
      </p>
      <button type="button" className="btn-tonal self-start" onClick={() => mergeSongs(song.id, other.id)}>
        Merge its takes into this one
      </button>
    </div>
  )
}
