import { useSyncExternalStore } from 'react'
import { get, set } from 'idb-keyval'
import { applyOps, enqueue, newId, type Library } from './ops'
import { ensureSession, isNetworkError, pb, signedInEmail, statusOf } from './pb'
import type { Collection, Marker, Op, Tag, Take } from './types'

export interface State {
  /** What the NAS last told us. */
  server: Library
  /** Changes made here that the NAS doesn't have yet, oldest first. */
  queue: Op[]
  /** Inbox takes put to the back of the queue, in the order they were skipped. */
  skipped: string[]
  lastSync: string
  loaded: boolean
  syncing: boolean
  /** Whether the last attempt to reach the NAS worked. */
  reachable: boolean
  email: string
  notice: string
  /** Skip the sort sheet after a swipe. */
  quickSort: boolean
}

const EMPTY: Library = { takes: {}, tags: {}, markers: {} }

let state: State = {
  server: EMPTY,
  queue: [],
  skipped: [],
  lastSync: '',
  loaded: false,
  syncing: false,
  reachable: true,
  email: signedInEmail(),
  notice: '',
  quickSort: false,
}
const listeners = new Set<() => void>()

let libCache: { server: Library; queue: Op[]; lib: Library } | null = null

/** The library as shown: server records with unsent changes applied. */
export function library(s: State = state): Library {
  if (libCache && libCache.server === s.server && libCache.queue === s.queue) return libCache.lib
  const lib = applyOps(s.server, s.queue)
  libCache = { server: s.server, queue: s.queue, lib }
  return lib
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function getState() {
  return state
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

const K = { server: 'takes:server', queue: 'takes:queue', skipped: 'takes:skipped', lastSync: 'takes:lastSync', quick: 'takes:quickSort' }

async function save(key: string, value: unknown) {
  try {
    await set(key, value)
  } catch {
    // Storage can be unavailable (private mode); the app still works for this session.
  }
}

export async function init() {
  try {
    const [server, queue, skipped, lastSync, quickSort] = await Promise.all([
      get<Library>(K.server),
      get<Op[]>(K.queue),
      get<string[]>(K.skipped),
      get<string>(K.lastSync),
      get<boolean>(K.quick),
    ])
    setState({
      server: server ?? EMPTY,
      queue: queue ?? [],
      skipped: skipped ?? [],
      lastSync: lastSync ?? '',
      quickSort: quickSort ?? false,
      loaded: true,
    })
  } catch {
    setState({ loaded: true })
  }
  window.addEventListener('online', () => void sync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync()
  })
  if (state.email) {
    const session = await ensureSession()
    if (session === 'signed-out') setState({ email: '' })
    void sync()
  }
}

export function signedIn(email: string) {
  setState({ email })
  void sync({ full: true })
}

export function signedOut() {
  setState({ email: '' })
}

// ---- sync -------------------------------------------------------------------

let syncing: Promise<void> | null = null

export function sync(opts: { full?: boolean } = {}): Promise<void> {
  if (!state.email) return Promise.resolve()
  if (syncing) return syncing
  syncing = (async () => {
    setState({ syncing: true })
    try {
      const flushed = await flush()
      if (flushed) await pull(opts.full ?? false)
    } finally {
      setState({ syncing: false })
      syncing = null
    }
  })()
  return syncing
}

async function pull(full: boolean) {
  try {
    const since = full ? '' : state.lastSync
    const [takes, tags, markers] = await Promise.all([
      pb.collection('demo_takes').getFullList<Take>({
        batch: 500,
        filter: since ? pb.filter('updated >= {:since}', { since }) : '',
        requestKey: null,
      }),
      pb.collection('demo_tags').getFullList<Tag>({ batch: 500, requestKey: null }),
      pb.collection('demo_markers').getFullList<Marker>({ batch: 500, requestKey: null }),
    ])
    const merged = since ? { ...state.server.takes } : {}
    let lastSync = since
    for (const t of takes) {
      merged[t.id] = slim(t)
      if (t.updated > lastSync) lastSync = t.updated
    }
    const server: Library = { takes: merged, tags: byId(tags), markers: byId(markers) }
    setState({ server, lastSync, reachable: true })
    await Promise.all([save(K.server, server), save(K.lastSync, lastSync)])
  } catch (err) {
    handleError(err)
  }
}

function slim(t: Take): Take {
  const { id, title, audio, duration, peaks, recorded_at, source_path, kind, status, tags, notes, song, sorted_at, created, updated } = t
  return { id, title, audio, duration, peaks, recorded_at, source_path, kind, status, tags: tags ?? [], notes, song, sorted_at, created, updated }
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const x of list) out[x.id] = x
  return out
}

/** Sends queued changes in order. Returns false if it had to stop early. */
async function flush(): Promise<boolean> {
  while (state.queue.length) {
    const op = state.queue[0]
    try {
      const col = pb.collection(op.col)
      let record: { id: string } | null = null
      if (op.kind === 'create') record = await col.create({ ...op.data, id: op.id }, { requestKey: null })
      else if (op.kind === 'update') record = await col.update(op.id, op.data, { requestKey: null })
      else await col.delete(op.id, { requestKey: null })
      commit(op, record)
    } catch (err) {
      const status = statusOf(err)
      if (op.kind === 'delete' && status === 404) {
        commit(op, null) // already gone
        continue
      }
      if (isNetworkError(err) || status === 401 || status === 403) {
        handleError(err)
        return false
      }
      // The NAS rejected it (bad data, or the record was removed there): drop it so the rest can go.
      commit(op, null, true)
      setState({ notice: 'One change could not be saved and was undone.' })
    }
  }
  return true
}

function commit(op: Op, record: { id: string } | null, dropped = false) {
  const queue = state.queue.filter((q) => q !== op)
  let server = state.server
  if (!dropped) {
    const key = op.col === 'demo_takes' ? 'takes' : op.col === 'demo_tags' ? 'tags' : 'markers'
    const table = { ...server[key] } as Record<string, unknown>
    if (op.kind === 'delete') delete table[op.id]
    else if (record) table[op.id] = op.col === 'demo_takes' ? slim(record as Take) : record
    server = { ...server, [key]: table }
  }
  setState({ queue, server, reachable: true })
  void save(K.queue, queue)
  void save(K.server, server)
}

function handleError(err: unknown) {
  const status = statusOf(err)
  if (status === 401 || status === 403) {
    void ensureSession().then((s) => {
      if (s === 'signed-out') setState({ email: '' })
    })
  }
  setState({ reachable: !isNetworkError(err) })
}

// ---- changes ------------------------------------------------------------------

let flushTimer: ReturnType<typeof setTimeout> | null = null

/** Sends the queue after a short pause, so typing in a note goes up as one save. */
function scheduleFlush(delay = 800) {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!state.email) return
    if (syncing) {
      void syncing.then(() => state.queue.length && scheduleFlush(0))
      return
    }
    setState({ syncing: true })
    syncing = flush()
      .then(() => undefined)
      .finally(() => {
        syncing = null
        setState({ syncing: false })
      })
  }, delay)
}

function change(op: Op) {
  const queue = enqueue(state.queue, op)
  setState({ queue })
  void save(K.queue, queue)
  scheduleFlush()
}

export function updateTake(id: string, data: Partial<Take>) {
  change({ kind: 'update', col: 'demo_takes', id, data })
}

export function createTag(name: string): string {
  const existing = Object.values(library().tags).find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  if (existing) return existing.id
  const id = newId()
  change({ kind: 'create', col: 'demo_tags', id, data: { name: name.trim(), color: '' } })
  return id
}

export function renameTag(id: string, name: string) {
  change({ kind: 'update', col: 'demo_tags', id, data: { name: name.trim() } })
}

export function deleteTag(id: string) {
  change({ kind: 'delete', col: 'demo_tags', id })
}

export function addMarker(take: string, seconds: number, text = ''): string {
  const id = newId()
  change({ kind: 'create', col: 'demo_markers', id, data: { take, seconds: Math.round(seconds * 10) / 10, text } })
  return id
}

export function updateMarker(id: string, data: Partial<Marker>) {
  change({ kind: 'update', col: 'demo_markers', id, data })
}

export function deleteMarker(id: string) {
  change({ kind: 'delete', col: 'demo_markers' as Collection, id })
}

export function setSkipped(skipped: string[]) {
  setState({ skipped })
  void save(K.skipped, skipped)
}

export function setQuickSort(quickSort: boolean) {
  setState({ quickSort })
  void save(K.quick, quickSort)
}

export function clearNotice() {
  setState({ notice: '' })
}

/** Forget everything stored on this phone (on sign-out). Unsent changes are lost, so the UI warns first. */
export async function forgetLocal() {
  libCache = null
  setState({ server: EMPTY, queue: [], skipped: [], lastSync: '' })
  await Promise.all([save(K.server, EMPTY), save(K.queue, []), save(K.skipped, []), save(K.lastSync, '')])
}
