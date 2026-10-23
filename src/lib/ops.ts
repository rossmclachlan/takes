import type { Collection, Marker, Op, Song, Tag, Take } from './types'

/** Everything the app shows: the NAS's records with this phone's unsent changes applied on top. */
export interface Library {
  takes: Record<string, Take>
  tags: Record<string, Tag>
  markers: Record<string, Marker>
  songs: Record<string, Song>
}

/** Which part of the library each collection fills. */
export const TABLE = {
  demo_takes: 'takes',
  demo_tags: 'tags',
  demo_markers: 'markers',
  demo_songs: 'songs',
} as const satisfies Record<Collection, keyof Library>

type Table = Record<string, { id: string }>

export function applyOp(lib: Library, op: Op): Library {
  const table: Table = lib[TABLE[op.col]]
  const next: Table = { ...table }
  if (op.kind === 'delete') {
    delete next[op.id]
  } else if (op.kind === 'create') {
    next[op.id] = { ...(op.data as object), id: op.id } as { id: string }
  } else {
    const current = table[op.id]
    if (!current) return lib // updated something the NAS no longer has
    next[op.id] = { ...current, ...op.data }
  }
  let out: Library = { ...lib, [TABLE[op.col]]: next }
  // Deleting a take's tag on the NAS doesn't touch the take, so mirror PocketBase here.
  if (op.kind === 'delete' && op.col === 'demo_tags') {
    const takes: Library['takes'] = {}
    for (const t of Object.values(out.takes)) {
      takes[t.id] = t.tags.includes(op.id) ? { ...t, tags: t.tags.filter((x) => x !== op.id) } : t
    }
    out = { ...out, takes }
  }
  return out
}

export function applyOps(lib: Library, ops: Op[]): Library {
  return ops.reduce(applyOp, lib)
}

/**
 * Adds an op to the queue, folding it into an earlier one for the same record
 * where possible, so a burst of edits to one note goes up as one request.
 */
export function enqueue(queue: Op[], op: Op): Op[] {
  const i = findLastIndex(queue, (q) => q.col === op.col && q.id === op.id)
  if (i === -1) return [...queue, op]
  const prev = queue[i]
  const rest = [...queue.slice(0, i), ...queue.slice(i + 1)]

  if (op.kind === 'update' && prev.kind !== 'delete' && i === queue.length - 1) {
    // Later fields win. A create stays a create, with the new fields included.
    // Only fold into the last op: moving fields earlier could send a reference
    // (say, to a tag made in between) before the record it points at exists.
    return [...queue.slice(0, i), { ...prev, data: { ...prev.data, ...op.data } }]
  }
  if (op.kind === 'delete' && prev.kind === 'create') {
    // Never reached the NAS, so nothing to delete there. Drop every op for it.
    return rest.filter((q) => !(q.col === op.col && q.id === op.id))
  }
  if (op.kind === 'delete') {
    return [...rest.filter((q) => !(q.col === op.col && q.id === op.id)), op]
  }
  return [...queue, op]
}

function findLastIndex<T>(arr: T[], fn: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i
  return -1
}

/** PocketBase accepts client-made ids of 15 lowercase letters and digits, so records can be made offline. */
export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}
