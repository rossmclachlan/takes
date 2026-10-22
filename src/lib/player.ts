import { useSyncExternalStore } from 'react'
import { cachedBlob, download, remoteUrl } from './audioCache'
import type { Take } from './types'

export interface PlayerState {
  takeId: string
  playing: boolean
  time: number
  duration: number
  loading: boolean
  error: string
  /** Takes to play after this one, for "play all" in the library. */
  queue: Take[]
}

let state: PlayerState = { takeId: '', playing: false, time: 0, duration: 0, loading: false, error: '', queue: [] }
const listeners = new Set<() => void>()
let audio: HTMLAudioElement | null = null
let blobUrl = ''
let current: Take | null = null
let loadSeq = 0

function setState(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function usePlayer<T>(select: (s: PlayerState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => select(state),
  )
}

export function playerState() {
  return state
}

function el(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('play', () => setState({ playing: true }))
  audio.addEventListener('pause', () => setState({ playing: false }))
  audio.addEventListener('loadedmetadata', () => setState({ duration: audio!.duration || state.duration }))
  audio.addEventListener('waiting', () => setState({ loading: true }))
  audio.addEventListener('playing', () => setState({ loading: false }))
  audio.addEventListener('timeupdate', () => setState({ time: audio!.currentTime }))
  audio.addEventListener('ended', () => {
    setState({ playing: false, time: state.duration })
    const [next, ...rest] = state.queue
    if (next) void load(next, { autoplay: true, queue: rest })
  })
  audio.addEventListener('error', () => {
    if (audio!.src) setState({ loading: false, playing: false, error: 'This take could not be played.' })
  })
  // Smooth progress while playing; timeupdate alone only fires a few times a second.
  const tick = () => {
    if (audio && !audio.paused && Math.abs(audio.currentTime - state.time) > 0.05) setState({ time: audio.currentTime })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  setupMediaSession()
  return audio
}

/** Loads a take, from the phone's cache when it's there, otherwise streamed from the NAS. */
export async function load(take: Take, opts: { autoplay?: boolean; queue?: Take[]; at?: number } = {}) {
  const a = el()
  const seq = ++loadSeq
  if (current?.id === take.id && a.src) {
    if (opts.queue) setState({ queue: opts.queue })
    if (opts.at !== undefined) a.currentTime = opts.at
    if (opts.autoplay) await play()
    return
  }
  a.pause()
  current = take
  setState({ takeId: take.id, time: opts.at ?? 0, duration: take.duration || 0, loading: true, error: '', queue: opts.queue ?? [], playing: false })
  setMediaMetadata(take)
  let src: string
  try {
    const blob = await cachedBlob(take)
    if (blob) {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      blobUrl = URL.createObjectURL(blob)
      src = blobUrl
    } else {
      src = await remoteUrl(take)
      // Keep short takes for next time; long ones stream.
      if ((take.duration || 0) < 600) void download(take)
    }
  } catch {
    if (seq === loadSeq) setState({ loading: false, error: 'Not downloaded, and the NAS can’t be reached.' })
    return
  }
  if (seq !== loadSeq) return
  a.src = src
  if (opts.at) a.currentTime = opts.at
  setState({ loading: false })
  if (opts.autoplay) await play()
}

export async function play() {
  try {
    await el().play()
  } catch {
    // Autoplay can be refused until the person taps; the play button still works.
    setState({ playing: false })
  }
}

export function pause() {
  audio?.pause()
}

export function toggle() {
  if (!audio || !audio.src) return
  if (audio.paused) void play()
  else audio.pause()
}

export function seek(seconds: number) {
  if (!audio) return
  const d = audio.duration || state.duration
  audio.currentTime = Math.max(0, Math.min(seconds, d ? d - 0.05 : seconds))
  setState({ time: audio.currentTime })
}

export function skipBy(delta: number) {
  if (audio) seek(audio.currentTime + delta)
}

export function stop() {
  audio?.pause()
  current = null
  setState({ takeId: '', playing: false, time: 0, queue: [] })
}

/** Start of the loudest few seconds, from the waveform peaks. */
export function loudestAt(take: Take, windowSeconds = 8): number {
  const peaks = take.peaks ?? []
  if (!peaks.length || !take.duration) return 0
  const perPeak = take.duration / peaks.length
  const w = Math.max(1, Math.round(windowSeconds / perPeak))
  let best = 0
  let bestSum = -1
  let sum = 0
  for (let i = 0; i < peaks.length; i++) {
    sum += peaks[i]
    if (i >= w) sum -= peaks[i - w]
    if (i >= w - 1 && sum > bestSum) {
      bestSum = sum
      best = i - w + 1
    }
  }
  return best * perPeak
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => void play())
  ms.setActionHandler('pause', () => pause())
  ms.setActionHandler('seekbackward', () => skipBy(-15))
  ms.setActionHandler('seekforward', () => skipBy(15))
  ms.setActionHandler('nexttrack', () => {
    const [next, ...rest] = state.queue
    if (next) void load(next, { autoplay: true, queue: rest })
  })
}

function setMediaMetadata(take: Take) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
  navigator.mediaSession.metadata = new MediaMetadata({ title: take.title, artist: 'Takes' })
}
