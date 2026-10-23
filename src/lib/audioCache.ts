import { pb } from './pb'
import type { Take } from './types'

// Audio is a protected PocketBase file: its URL needs a short-lived file token,
// so it can't be cached by URL. Downloads are kept in Cache Storage under a
// stable key per take instead, which also makes them playable offline.
// v1 could hold the app's own HTML under a take's key (see remoteUrl), so it's dropped.
const CACHE = 'takes-audio-v2'
if (typeof caches !== 'undefined') void caches.delete('takes-audio-v1').catch(() => {})

const hasCaches = typeof caches !== 'undefined'

function key(t: Take): string {
  return new URL(`${import.meta.env.BASE_URL}__audio/${t.id}/${t.audio}`, location.origin).href
}

let token: { value: string; at: number } | null = null

async function fileToken(): Promise<string> {
  // Tokens last a few minutes; refresh well before that.
  if (token && Date.now() - token.at < 60_000) return token.value
  token = { value: await pb.files.getToken(), at: Date.now() }
  return token.value
}

export async function remoteUrl(t: Take): Promise<string> {
  // Takes are stored slimmed, without collectionName, and getUrl returns '' without it.
  return pb.files.getUrl({ id: t.id, collectionName: 'demo_takes' }, t.audio, { token: await fileToken() })
}

export async function cachedBlob(t: Take): Promise<Blob | null> {
  if (!hasCaches) return null
  try {
    const hit = await (await caches.open(CACHE)).match(key(t))
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

export async function isCached(t: Take): Promise<boolean> {
  if (!hasCaches) return false
  try {
    return !!(await (await caches.open(CACHE)).match(key(t)))
  } catch {
    return false
  }
}

const inFlight = new Map<string, Promise<boolean>>()

/** Downloads a take's audio into the cache. Resolves false if it couldn't. */
export function download(t: Take): Promise<boolean> {
  if (!hasCaches) return Promise.resolve(false)
  const k = key(t)
  const existing = inFlight.get(k)
  if (existing) return existing
  const p = (async () => {
    try {
      const cache = await caches.open(CACHE)
      if (await cache.match(k)) return true
      const resp = await fetch(await remoteUrl(t))
      if (!resp.ok || !resp.headers.get('content-type')?.startsWith('audio/')) return false
      await cache.put(k, new Response(await resp.blob(), { headers: { 'content-type': 'audio/mp4' } }))
      return true
    } catch {
      return false
    } finally {
      inFlight.delete(k)
    }
  })()
  inFlight.set(k, p)
  return p
}

/** Downloads the next few takes in order, one at a time, stopping at the first failure. */
export async function prefetch(takes: Take[]): Promise<void> {
  for (const t of takes) {
    if (!navigator.onLine) return
    if (!(await download(t))) return
  }
}

export async function cacheStats(): Promise<{ count: number; bytes: number }> {
  if (!hasCaches) return { count: 0, bytes: 0 }
  const cache = await caches.open(CACHE)
  const keys = await cache.keys()
  let bytes = 0
  if (navigator.storage?.estimate) bytes = (await navigator.storage.estimate()).usage ?? 0
  return { count: keys.length, bytes }
}

export async function clearCache(): Promise<void> {
  if (hasCaches) await caches.delete(CACHE)
}
