import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bookmark, FastForward, Pause, Play, Rewind, Trash2, X } from 'lucide-react'
import { clock, recordedLabel } from '../lib/format'
import { songIndex } from '../lib/library'
import { load, seek, skipBy, toggle, usePlayer } from '../lib/player'
import { addMarker, addToSong, createSong, deleteMarker, library, removeFromSong, updateMarker, updateTake, useStore } from '../lib/store'
import { type Kind, type Marker, type Take } from '../lib/types'
import { SongRow } from './Library'
import { NEW_SONG, SongPicker, StatusPicker, TagPicker } from './SortFields'
import { Waveform } from './Waveform'

const KINDS: { value: Kind; label: string }[] = [
  { value: 'song', label: 'Song' },
  { value: 'idea', label: 'Idea' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'binned', label: 'Binned' },
]

export function Detail({ id, onBack, onOpenSong }: { id: string; onBack: () => void; onOpenSong: (id: string) => void }) {
  const lib = useStore((s) => library(s))
  const take = lib.takes[id]
  const isCurrent = usePlayer((p) => p.takeId === id)
  const playing = usePlayer((p) => p.takeId === id && p.playing)
  const time = usePlayer((p) => (p.takeId === id ? p.time : 0))
  const error = usePlayer((p) => (p.takeId === id ? p.error : ''))
  const markers = useMemo(
    () => Object.values(lib.markers).filter((m) => m.take === id).sort((a, b) => a.seconds - b.seconds),
    [lib.markers, id],
  )

  useEffect(() => {
    if (take && !isCurrent) void load(take)
    // Only when opening a different take; don't steal the player back after "play all" moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!take) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <button type="button" className="btn-outlined" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <p className="text-ink-variant">This take isn’t on this phone yet.</p>
      </div>
    )
  }

  const duration = take.duration || 0
  const playFrom = (at: number) => {
    if (isCurrent) {
      seek(at)
      if (!playing) toggle()
    } else void load(take, { autoplay: true, at })
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-1 pb-8">
      <div className="flex items-center justify-between">
        <button type="button" className="btn-icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm text-ink-variant">{recordedLabel(take.recorded_at)}</span>
      </div>

      <TitleField take={take} />

      <div className="card flex flex-col gap-3 p-4">
        <Waveform
          peaks={take.peaks}
          progress={duration ? time / duration : 0}
          bars={72}
          height={84}
          markers={duration ? markers.map((m) => m.seconds / duration) : []}
          onSeek={(f) => playFrom(f * duration)}
        />
        <div className="flex items-center justify-between text-sm text-ink-variant tabular-nums">
          <span>{clock(time)}</span>
          {error && <span className="text-error">{error}</span>}
          <span>{clock(duration)}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="btn-icon h-11 w-11" aria-label="Back 15 seconds" onClick={() => skipBy(-15)} disabled={!isCurrent}>
            <Rewind size={18} />
          </button>
          <button type="button" className="fab h-14 w-14" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (isCurrent ? toggle() : void load(take, { autoplay: true }))}>
            {playing ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
          </button>
          <button type="button" className="btn-icon h-11 w-11" aria-label="Forward 15 seconds" onClick={() => skipBy(15)} disabled={!isCurrent}>
            <FastForward size={18} />
          </button>
          <button type="button" className="btn-tonal" onClick={() => addMarker(take.id, isCurrent ? time : 0)}>
            <Bookmark size={16} /> Mark {clock(isCurrent ? time : 0)}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-section">Kept as</span>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={take.kind === k.value}
              className={`chip ${take.kind === k.value ? 'chip-on' : ''}`}
              onClick={() =>
                updateTake(take.id, {
                  kind: k.value,
                  ...(k.value !== 'inbox' && !take.sorted_at ? { sorted_at: new Date().toISOString() } : {}),
                })
              }
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {(take.kind === 'song' || take.kind === 'idea') && <SongField take={take} onOpenSong={onOpenSong} />}

      {take.kind === 'idea' && (
        <div className="flex flex-col gap-2">
          <span className="label-section">Status</span>
          <StatusPicker optional value={take.status} onChange={(status) => updateTake(take.id, { status })} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="label-section">Tags</span>
        <TagPicker take={take} value={take.tags} onChange={(tags) => updateTake(take.id, { tags })} />
      </div>

      <NotesField take={take} />

      <div className="flex flex-col gap-2">
        <span className="label-section">Markers</span>
        {markers.length === 0 && <p className="text-sm text-ink-variant">Tap Mark while it plays to note a moment, like where the hook comes in.</p>}
        <ul className="flex flex-col gap-2">
          {markers.map((m) => (
            <MarkerRow key={m.id} marker={m} onPlay={() => playFrom(m.seconds)} />
          ))}
        </ul>
      </div>

      {take.source_path && (
        <p className="text-xs break-all text-ink-variant">
          Original on the NAS: <span className="font-mono">{take.source_path}</span>
        </p>
      )}
      {take.kind !== 'binned' && (
        <button type="button" className="btn-danger self-start" onClick={() => { updateTake(take.id, { kind: 'binned' }); onBack() }}>
          <Trash2 size={16} /> Bin this take
        </button>
      )}
    </div>
  )
}

function TitleField({ take }: { take: Take }) {
  const [value, setValue] = useState(take.title)
  return (
    <textarea
      id="title"
      aria-label="Name"
      rows={1}
      className="field-sizing-content resize-none rounded-xl bg-transparent px-1 font-display text-[30px] leading-tight font-semibold text-ink outline-none focus:bg-surface"
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        const v = value.trim()
        if (v && v !== take.title) updateTake(take.id, { title: v })
        else setValue(take.title)
      }}
    />
  )
}

function NotesField({ take }: { take: Take }) {
  const [value, setValue] = useState(take.notes)
  // Saves as you type; the store folds the edits into one request.
  return (
    <label className="flex flex-col gap-2">
      <span className="label-section">Notes</span>
      <textarea
        id="notes"
        className="input-field field-sizing-content min-h-28"
        placeholder="Capo, tuning, lyric ideas, what to try next…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          updateTake(take.id, { notes: e.target.value })
        }}
      />
    </label>
  )
}

function MarkerRow({ marker, onPlay }: { marker: Marker; onPlay: () => void }) {
  const [text, setText] = useState(marker.text)
  return (
    <li className="flex items-center gap-2">
      <button type="button" onClick={onPlay} className="shrink-0 rounded-lg bg-accent px-2 py-1 font-mono text-xs font-bold text-white tabular-nums">
        {clock(marker.seconds)}
      </button>
      <input
        id={`marker-${marker.id}`}
        className="input-field min-w-0 flex-1 py-1.5 text-sm"
        placeholder="What happens here?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== marker.text && updateMarker(marker.id, { text })}
      />
      <button type="button" className="btn-icon h-8 w-8" aria-label="Delete marker" onClick={() => deleteMarker(marker.id)}>
        <X size={15} />
      </button>
    </li>
  )
}

/** The song this take is in, with a way to move it to another one or start a new one. */
function SongField({ take, onOpenSong }: { take: Take; onOpenSong: (id: string) => void }) {
  const lib = useStore((s) => library(s))
  const song = useMemo(() => songIndex(lib).get(take.id), [lib, take.id])
  const [changing, setChanging] = useState(false)
  const picking = changing || (!song && take.kind === 'song')

  const pick = (id: string) => {
    if (id === NEW_SONG) {
      if (song) removeFromSong(song.id, take.id)
      createSong({ title: take.title, takes: [take.id] })
    } else if (id !== song?.id) addToSong(id, take.id)
    setChanging(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="label-section">{take.kind === 'idea' ? 'Used in a song' : 'Song'}</span>
      {song && (
        <ul className="card overflow-hidden">
          <li>
            <SongRow song={song} onOpen={() => onOpenSong(song.id)} />
          </li>
        </ul>
      )}
      {picking ? (
        <SongPicker take={take} value={song?.id ?? ''} onChange={pick} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" onClick={() => setChanging(true)}>
            {song ? 'Move to another song' : 'Add to a song'}
          </button>
          {song && (
            <button type="button" className="chip" onClick={() => removeFromSong(song.id, take.id)}>
              Take out of {song.title}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
