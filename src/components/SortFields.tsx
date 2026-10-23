import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { suggestSongs, suggestTags, tagsByUse } from '../lib/library'
import { createTag, library, useStore } from '../lib/store'
import { STATUSES, type Status, type Take } from '../lib/types'

/** Tapping the chosen status again clears it when `optional` (ideas don't need one). */
export function StatusPicker({ value, onChange, optional = false }: { value: Status | ''; onChange: (s: Status | '') => void; optional?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status">
      {STATUSES.map((s) => {
        const on = value === s.value
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && optional ? '' : s.value)}
            className={`chip ${on ? `sticker-sm status-${s.value} border-ink` : ''}`}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Chosen tags first, then suggestions for this take. Typing narrows to
 * matching tags and offers to make a new one.
 */
export function TagPicker({ take, value, onChange }: { take: Take; value: string[]; onChange: (ids: string[]) => void }) {
  const lib = useStore((s) => library(s))
  const [draft, setDraft] = useState('')
  const q = draft.trim().toLowerCase()
  const suggested = useMemo(() => suggestTags(lib, { ...take, tags: value }, 8), [lib, take, value])
  const matching = useMemo(
    () => (q ? tagsByUse(lib).filter((t) => !value.includes(t.id) && t.name.toLowerCase().includes(q)).slice(0, 12) : []),
    [lib, q, value],
  )
  const exact = q && Object.values(lib.tags).some((t) => t.name.toLowerCase() === q)
  const offered = q ? matching : suggested

  const add = (id: string) => {
    if (!value.includes(id)) onChange([...value, id])
    setDraft('')
  }
  const create = () => {
    const name = draft.trim().replace(/^#/, '')
    if (name) add(createTag(name))
  }

  return (
    <div className="flex flex-col gap-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((id) =>
            lib.tags[id] ? (
              <button key={id} type="button" aria-label={`Remove #${lib.tags[id].name}`} onClick={() => onChange(value.filter((x) => x !== id))} className="chip chip-on">
                #{lib.tags[id].name} <X size={14} />
              </button>
            ) : null,
          )}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (matching.length && !exact) add(matching[0].id)
          else create()
        }}
      >
        <input
          id="new-tag"
          className="input-field min-w-0 flex-1 py-2"
          placeholder={Object.keys(lib.tags).length ? 'Find or add a tag' : 'Add a tag, e.g. guitar'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          enterKeyHint="done"
          autoComplete="off"
        />
        <button type="submit" className="btn-icon h-10 w-10" aria-label="Add tag" disabled={!q}>
          <Plus size={18} />
        </button>
      </form>
      {(offered.length > 0 || (q && !exact)) && (
        <div className="flex flex-wrap gap-2">
          {!q && <span className="self-center text-xs font-semibold text-ink-variant">Suggested</span>}
          {offered.map((t) => (
            <button key={t.id} type="button" onClick={() => add(t.id)} className="chip">
              #{t.name}
            </button>
          ))}
          {q && !exact && (
            <button type="button" onClick={create} className="chip border-dashed">
              <Plus size={14} /> New #{draft.trim().replace(/^#/, '')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const NEW_SONG = 'new'

/** "New song" or one of the songs this take is most likely part of; typing finds any song. */
export function SongPicker({ take, value, onChange, allowNew = true }: { take: Take; value: string; onChange: (songId: string) => void; allowNew?: boolean }) {
  const lib = useStore((s) => library(s))
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const suggested = useMemo(() => suggestSongs(lib, take, 5), [lib, take])
  const songs = useMemo(() => {
    const list = q
      ? Object.values(lib.songs).filter((s) => s.title.toLowerCase().includes(q)).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 12)
      : suggested
    const chosen = lib.songs[value]
    return chosen && !list.includes(chosen) ? [chosen, ...list] : list
  }, [lib.songs, q, suggested, value])
  const total = Object.keys(lib.songs).length

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Song">
        {allowNew && (
          <button type="button" role="radio" aria-checked={value === NEW_SONG} onClick={() => onChange(NEW_SONG)} className={`chip ${value === NEW_SONG ? 'chip-on' : 'border-dashed'}`}>
            <Plus size={14} /> New song
          </button>
        )}
        {songs.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={value === s.id} onClick={() => onChange(s.id)} className={`chip ${value === s.id ? 'chip-on' : ''}`}>
            {s.title}
          </button>
        ))}
      </div>
      {(q || total > suggested.length) && (
        <input
          id="find-song"
          className="input-field py-2"
          placeholder={`Find another song (${total})`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      )}
    </div>
  )
}
