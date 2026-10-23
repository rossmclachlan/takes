import type { Library } from './ops'
import type { Song, Status, Tag, Take } from './types'
import { STATUSES } from './types'

export function byRecorded(a: Take, b: Take): number {
  return (a.recorded_at || a.created).localeCompare(b.recorded_at || b.created)
}

export function bySortedDesc(a: Take, b: Take): number {
  return (b.sorted_at || b.updated).localeCompare(a.sorted_at || a.updated)
}

/**
 * The inbox in play order: oldest recording first, with skipped ones moved
 * to the back in the order they were skipped.
 */
export function inboxQueue(lib: Library, skipped: string[]): Take[] {
  const inbox = Object.values(lib.takes).filter((t) => t.kind === 'inbox')
  const skipRank = new Map(skipped.map((id, i) => [id, i]))
  return inbox.sort((a, b) => {
    const sa = skipRank.get(a.id)
    const sb = skipRank.get(b.id)
    if (sa !== undefined || sb !== undefined) {
      if (sa === undefined) return -1
      if (sb === undefined) return 1
      return sa - sb
    }
    return byRecorded(a, b)
  })
}

export function matches(take: Take, query: string, tags: Record<string, Tag>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [take.title, take.notes, ...take.tags.map((id) => tags[id]?.name ?? '')].join('\n').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

export interface Group {
  key: string
  label: string
  takes: Take[]
}

export interface SongGroup {
  key: Status
  label: string
  songs: Song[]
}

/** Which song each take is in. */
export function songIndex(lib: Library): Map<string, Song> {
  const index = new Map<string, Song>()
  for (const song of Object.values(lib.songs)) for (const id of song.takes) if (!index.has(id)) index.set(id, song)
  return index
}

/** A song's takes in rank order, best first, leaving out binned ones. */
export function songTakes(lib: Library, song: Song): Take[] {
  return song.takes.map((id) => lib.takes[id]).filter((t): t is Take => !!t && t.kind !== 'binned')
}

/** Most recently changed first; songs made on this phone and not yet saved count as newest. */
function byUpdatedDesc(a: Song, b: Song): number {
  return (b.updated || '\uffff').localeCompare(a.updated || '\uffff')
}

export function songMatches(lib: Library, song: Song, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [song.title, song.notes, ...songTakes(lib, song).flatMap((t) => [t.title, t.notes])].join('\n').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

/** Songs grouped by status in working order. */
export function songGroups(lib: Library, query: string, status: Status | 'all'): SongGroup[] {
  const songs = Object.values(lib.songs).filter(
    (s) => (status === 'all' || (s.status || 'to_revisit') === status) && songMatches(lib, s, query),
  )
  return STATUSES.map(({ value, label }) => ({
    key: value,
    label,
    songs: songs.filter((s) => (s.status || 'to_revisit') === value).sort(byUpdatedDesc),
  })).filter((g) => g.songs.length)
}

/** Takes sorted as songs that haven't been put in a song yet (quick sort skips that step). */
export function unfiledSongTakes(lib: Library): Take[] {
  const index = songIndex(lib)
  return Object.values(lib.takes)
    .filter((t) => t.kind === 'song' && !index.has(t.id))
    .sort(bySortedDesc)
}

export type IdeaFilter = 'all' | 'untagged' | `status:${Status}` | string

/** Ideas grouped by tag; an idea with several tags shows under each. Untagged ones come last. */
export function ideaGroups(lib: Library, query: string, filter: IdeaFilter): Group[] {
  const status = filter.startsWith('status:') ? filter.slice(7) : ''
  const tagFilter = status ? 'all' : filter
  const ideas = Object.values(lib.takes)
    .filter((t) => t.kind === 'idea' && (!status || t.status === status) && matches(t, query, lib.tags))
    .sort(bySortedDesc)
  if (tagFilter === 'untagged') {
    const list = ideas.filter((t) => !t.tags.some((id) => lib.tags[id]))
    return list.length ? [{ key: 'untagged', label: 'Untagged', takes: list }] : []
  }
  const tags = tagsByUse(lib).filter((t) => tagFilter === 'all' || t.id === tagFilter)
  const groups: Group[] = tags
    .map((tag) => ({ key: tag.id, label: tag.name, takes: ideas.filter((t) => t.tags.includes(tag.id)) }))
    .filter((g) => g.takes.length)
  if (tagFilter === 'all') {
    const untagged = ideas.filter((t) => !t.tags.some((id) => lib.tags[id]))
    if (untagged.length) groups.push({ key: 'untagged', label: 'Untagged', takes: untagged })
  }
  return groups
}

/** Tags, most used first, so the sort sheet offers the likely ones up front. */
export function tagsByUse(lib: Library): Tag[] {
  const count = new Map<string, number>()
  for (const t of Object.values(lib.takes)) for (const id of t.tags) count.set(id, (count.get(id) ?? 0) + 1)
  return Object.values(lib.tags).sort(
    (a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.name.localeCompare(b.name),
  )
}

const HOUR = 3600_000
const SESSION = 3 * HOUR

function when(t: Take): number {
  return Date.parse((t.recorded_at || t.created).replace(' ', 'T'))
}

/** Recorded within a few hours of each other, so probably the same session. */
export function sameSitting(a: Take, b: Take): boolean {
  return Math.abs(when(a) - when(b)) < SESSION
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^\d+$/.test(w) && !STOP.has(w)))
}
const STOP = new Set(['the', 'and', 'take', 'idea', 'song', 'recording', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'at'])

/**
 * Tags to offer for a take, best guess first: ones on takes recorded in the
 * same sitting, ones named in its title or notes, ones used on the last few
 * ideas sorted, then the most used.
 */
export function suggestTags(lib: Library, take: Take, limit = 6): Tag[] {
  const score = new Map<string, number>()
  const add = (id: string, n: number) => lib.tags[id] && score.set(id, (score.get(id) ?? 0) + n)
  const at = when(take)
  const others = Object.values(lib.takes).filter((t) => t.id !== take.id && t.tags.length)
  for (const t of others) {
    const gap = Math.abs(when(t) - at)
    if (gap < SESSION) for (const id of t.tags) add(id, 6 * (1 - gap / SESSION) + 2)
  }
  const recent = others.filter((t) => t.sorted_at).sort(bySortedDesc).slice(0, 8)
  recent.forEach((t, i) => t.tags.forEach((id) => add(id, 3 * (1 - i / 8))))
  const named = words(`${take.title} ${take.notes}`)
  for (const tag of Object.values(lib.tags)) {
    if ([...words(tag.name)].some((w) => named.has(w))) add(tag.id, 8)
  }
  tagsByUse(lib).forEach((t, i) => add(t.id, Math.max(0, 1 - i / 20)))
  return [...score.entries()]
    .filter(([id]) => !take.tags.includes(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => lib.tags[id])
}

/**
 * Songs a take is likely another take of: ones with takes recorded in the same
 * sitting, ones whose name shares a word with the take, then the songs added
 * to most recently.
 */
export function suggestSongs(lib: Library, take: Take, limit = 5): Song[] {
  const at = when(take)
  const named = words(`${take.title} ${take.notes}`)
  const scored = Object.values(lib.songs).map((song) => {
    let n = 0
    const takes = songTakes(lib, song).filter((t) => t.id !== take.id)
    for (const t of takes) {
      const gap = Math.abs(when(t) - at)
      if (gap < SESSION) n += 6 * (1 - gap / SESSION) + 3
    }
    if ([...words(song.title)].some((w) => named.has(w))) n += 8
    const lastSorted = takes.reduce((m, t) => (t.sorted_at > m ? t.sorted_at : m), '')
    return { song, n, lastSorted: lastSorted || song.updated || '\uffff' }
  })
  return scored
    .sort((a, b) => b.n - a.n || b.lastSorted.localeCompare(a.lastSorted))
    .slice(0, limit)
    .map((s) => s.song)
}

/**
 * Takes to offer when adding to a song: recorded near the song's takes first,
 * then the rest newest first. Binned takes and the song's own are left out.
 */
export function candidateTakes(lib: Library, song: Song, query: string): Take[] {
  const mine = songTakes(lib, song)
  const times = mine.map(when)
  const near = (t: Take) => (times.length ? Math.min(...times.map((x) => Math.abs(when(t) - x))) : Infinity)
  return Object.values(lib.takes)
    .filter((t) => t.kind !== 'binned' && !song.takes.includes(t.id) && matches(t, query, lib.tags))
    .map((t) => ({ t, gap: near(t) }))
    .sort((a, b) => (a.gap < SESSION || b.gap < SESSION ? a.gap - b.gap : when(b.t) - when(a.t)))
    .map((x) => x.t)
}

export function counts(lib: Library) {
  const c = { inbox: 0, song: 0, idea: 0, binned: 0, songs: Object.keys(lib.songs).length }
  for (const t of Object.values(lib.takes)) c[t.kind]++
  return c
}
