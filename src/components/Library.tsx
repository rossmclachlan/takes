import { useMemo, useState } from 'react'
import { ChevronRight, Pause, Play, Search, X } from 'lucide-react'
import { clock, shortDate } from '../lib/format'
import { ideaGroups, songGroups, songIndex, songTakes, tagsByUse, unfiledSongTakes, type Group, type IdeaFilter } from '../lib/library'
import { load, toggle, usePlayer } from '../lib/player'
import { library, useStore } from '../lib/store'
import { STATUSES, STATUS_LABEL, type Song, type Status, type Take } from '../lib/types'

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="input-field flex items-center gap-2 py-2">
      <Search size={18} className="shrink-0 text-ink-variant" />
      <input
        id="search"
        type="search"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-variant"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="text-ink-variant">
          <X size={18} />
        </button>
      )}
    </label>
  )
}

function FilterChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={`chip shrink-0 ${value === o.value ? 'chip-on' : ''}`}>
          {o.label}
          {o.count !== undefined && <span className="tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Songs({ onOpen, onOpenSong }: { onOpen: (id: string) => void; onOpenSong: (id: string) => void }) {
  const lib = useStore((s) => library(s))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const groups = useMemo(() => songGroups(lib, query, status), [lib, query, status])
  const all = useMemo(() => songGroups(lib, '', 'all'), [lib])
  const unfiled = useMemo(() => unfiledSongTakes(lib), [lib])
  const count = (s: Status) => all.find((g) => g.key === s)?.songs.length ?? 0
  const total = all.reduce((n, g) => n + g.songs.length, 0)

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-6">
      <SearchBox value={query} onChange={setQuery} placeholder="Search songs, takes and notes" />
      <FilterChips value={status} onChange={setStatus} options={[{ value: 'all' as const, label: 'All', count: total }, ...STATUSES.map((s) => ({ value: s.value, label: s.label, count: count(s.value) }))]} />
      {unfiled.length > 0 && !query && status === 'all' && (
        <section className="flex flex-col gap-1.5">
          <h2 className="label-section pt-2">Not in a song yet</h2>
          <ul className="card divide-y-[1.5px] divide-outline overflow-hidden">
            {unfiled.map((t) => (
              <li key={t.id}>
                <TakeRow take={t} onOpen={() => onOpen(t.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.length === 0 && !unfiled.length && (
        <p className="py-10 text-center text-ink-variant">{total ? 'No songs match.' : 'No songs yet. Swipe a take right in the inbox to start one.'}</p>
      )}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1.5">
          <h2 className="label-section flex items-center gap-2 pt-2">
            <span className={`rounded-full px-2 py-0.5 status-${g.key}`}>{g.label}</span>
            <span className="tabular-nums">{g.songs.length}</span>
          </h2>
          <ul className="card divide-y-[1.5px] divide-outline overflow-hidden">
            {g.songs.map((song) => (
              <li key={song.id}>
                <SongRow song={song} onOpen={() => onOpenSong(song.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Plays the song's best take, then the rest in rank order. */
export function SongRow({ song, onOpen }: { song: Song; onOpen: () => void }) {
  const lib = useStore((s) => library(s))
  const takes = useMemo(() => songTakes(lib, song), [lib, song])
  const best = takes[0]
  const isCurrent = usePlayer((p) => takes.some((t) => t.id === p.takeId))
  const playing = usePlayer((p) => p.playing && takes.some((t) => t.id === p.takeId))
  const sub = [`${takes.length} take${takes.length === 1 ? '' : 's'}`, song.notes ? `“${song.notes.split('\n')[0].slice(0, 60)}”` : ''].filter(Boolean)

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${isCurrent ? 'bg-accent-container/50' : ''}`}>
      <button
        type="button"
        aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}
        disabled={!best}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-sun text-ink disabled:opacity-40"
        onClick={() => (isCurrent ? toggle() : best && void load(best, { autoplay: true, queue: takes.slice(1) }))}
      >
        {playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
      </button>
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen}>
        <span className="truncate font-semibold text-ink">{song.title}</span>
        <span className="truncate text-xs text-ink-variant">{sub.join(' · ')}</span>
      </button>
      <ChevronRight size={18} className="shrink-0 text-ink-variant" />
    </div>
  )
}

export function Ideas({ onOpen }: { onOpen: (id: string) => void }) {
  const lib = useStore((s) => library(s))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<IdeaFilter>('all')
  const groups = useMemo(() => ideaGroups(lib, query, filter), [lib, query, filter])
  const tags = useMemo(() => tagsByUse(lib), [lib])
  const ideas = Object.values(lib.takes).filter((t) => t.kind === 'idea')
  const untagged = ideas.filter((t) => !t.tags.some((id) => lib.tags[id])).length
  const statuses = STATUSES.map((s) => ({ value: `status:${s.value}`, label: s.label, count: ideas.filter((i) => i.status === s.value).length })).filter((o) => o.count)

  return (
    <ListPage
      search={<SearchBox value={query} onChange={setQuery} placeholder="Search ideas, tags and notes" />}
      chips={
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: ideas.length },
            ...statuses,
            ...tags.map((t) => ({ value: t.id, label: `#${t.name}`, count: ideas.filter((i) => i.tags.includes(t.id)).length })),
            ...(untagged ? [{ value: 'untagged', label: 'Untagged', count: untagged }] : []),
          ]}
        />
      }
      groups={groups}
      onOpen={onOpen}
      empty={ideas.length ? 'No ideas match.' : 'No ideas yet. Swipe a take left in the inbox to keep it as an idea.'}
      groupPrefix="#"
    />
  )
}

function ListPage({ search, chips, groups, onOpen, empty, groupClass, groupPrefix = '' }: { search: React.ReactNode; chips: React.ReactNode; groups: Group[]; onOpen: (id: string) => void; empty: string; groupClass?: (g: Group) => string; groupPrefix?: string }) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-6">
      {search}
      {chips}
      {groups.length === 0 && <p className="py-10 text-center text-ink-variant">{empty}</p>}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between pt-2">
            <h2 className="label-section flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 ${groupClass ? groupClass(g) : 'bg-surface-variant text-ink'}`}>
                {g.key === 'untagged' ? g.label : groupPrefix + g.label}
              </span>
              <span className="tabular-nums">{g.takes.length}</span>
            </h2>
            <PlayAll takes={g.takes} />
          </div>
          <ul className="card divide-y-[1.5px] divide-outline overflow-hidden">
            {g.takes.map((t, i) => (
              <li key={t.id}>
                <TakeRow take={t} onOpen={() => onOpen(t.id)} queue={g.takes.slice(i + 1)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PlayAll({ takes }: { takes: Take[] }) {
  if (takes.length < 2) return null
  return (
    <button type="button" className="text-xs font-bold text-accent" onClick={() => void load(takes[0], { autoplay: true, queue: takes.slice(1) })}>
      Play all
    </button>
  )
}

export function TakeRow({ take, onOpen, queue = [], hideSong = false }: { take: Take; onOpen: () => void; queue?: Take[]; hideSong?: boolean }) {
  const lib = useStore((s) => library(s))
  const isCurrent = usePlayer((p) => p.takeId === take.id)
  const playing = usePlayer((p) => p.takeId === take.id && p.playing)
  const song = useMemo(() => (take.kind !== 'inbox' ? songIndex(lib).get(take.id) : undefined), [lib, take.id, take.kind])
  const markerCount = Object.values(lib.markers).filter((m) => m.take === take.id).length
  const sub = [
    song && !hideSong ? `#${songTakes(lib, song).findIndex((t) => t.id === take.id) + 1} in ${song.title}` : '',
    take.kind === 'idea' ? take.tags.map((id) => lib.tags[id] && `#${lib.tags[id].name}`).filter(Boolean).join(' ') : '',
    take.kind === 'idea' && take.status ? STATUS_LABEL[take.status] : '',
    markerCount ? `${markerCount} marker${markerCount > 1 ? 's' : ''}` : '',
    take.notes ? `“${take.notes.split('\n')[0].slice(0, 60)}”` : '',
  ].filter(Boolean)

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${isCurrent ? 'bg-accent-container/50' : ''}`}>
      <button
        type="button"
        aria-label={playing ? `Pause ${take.title}` : `Play ${take.title}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-sun text-ink"
        onClick={() => (isCurrent ? toggle() : void load(take, { autoplay: true, queue }))}
      >
        {playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
      </button>
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen}>
        <span className="truncate font-semibold text-ink">{take.title}</span>
        <span className="truncate text-xs text-ink-variant">{sub.length ? sub.join(' · ') : shortDate(take.recorded_at)}</span>
      </button>
      <span className="shrink-0 text-xs text-ink-variant tabular-nums">{clock(take.duration)}</span>
    </div>
  )
}
