import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { tagsByUse } from '../lib/library'
import { createTag, library, useStore } from '../lib/store'
import { STATUSES, type Status } from '../lib/types'

export function StatusPicker({ value, onChange }: { value: Status | ''; onChange: (s: Status) => void }) {
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
            onClick={() => onChange(s.value)}
            className={`chip ${on ? `sticker-sm status-${s.value} border-ink` : ''}`}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/** Toggle existing tags (most used first) or type a new one. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const lib = useStore((s) => library(s))
  const tags = useMemo(() => tagsByUse(lib), [lib])
  const [draft, setDraft] = useState('')

  const add = () => {
    const name = draft.trim()
    if (!name) return
    const id = createTag(name)
    if (!value.includes(id)) onChange([...value, id])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const on = value.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
                className={`chip ${on ? 'chip-on' : ''}`}
              >
                #{t.name}
              </button>
            )
          })}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          id="new-tag"
          className="input-field min-w-0 flex-1 py-2"
          placeholder={tags.length ? 'New tag' : 'Add a tag, e.g. guitar'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          enterKeyHint="done"
        />
        <button type="submit" className="btn-icon h-10 w-10" aria-label="Add tag" disabled={!draft.trim()}>
          <Plus size={18} />
        </button>
      </form>
    </div>
  )
}
