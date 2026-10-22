import type { Library } from './ops'
import type { Status, Tag, Take } from './types'
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

/** Songs grouped by status in working order. A song's extra takes stay under the song, not in the list. */
export function songGroups(lib: Library, query: string, status: Status | 'all'): Group[] {
  const songs = Object.values(lib.takes).filter(
    (t) => t.kind === 'song' && !t.song && (status === 'all' || t.status === status) && matches(t, query, lib.tags),
  )
  return STATUSES.map(({ value, label }) => ({
    key: value,
    label,
    takes: songs.filter((t) => (t.status || 'to_revisit') === value).sort(bySortedDesc),
  })).filter((g) => g.takes.length)
}

/** Ideas grouped by tag; an idea with several tags shows under each. Untagged ones come last. */
export function ideaGroups(lib: Library, query: string, tagFilter: string | 'all' | 'untagged'): Group[] {
  const ideas = Object.values(lib.takes)
    .filter((t) => t.kind === 'idea' && matches(t, query, lib.tags))
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

/** Takes linked to a song: its other takes and the ideas that belong to it. */
export function linkedTo(lib: Library, songId: string): Take[] {
  return Object.values(lib.takes)
    .filter((t) => t.song === songId && t.kind !== 'binned')
    .sort(byRecorded)
}

export function counts(lib: Library) {
  const c = { inbox: 0, song: 0, idea: 0, binned: 0 }
  for (const t of Object.values(lib.takes)) c[t.kind]++
  return c
}
