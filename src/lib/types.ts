// Mirrors the demo_* collections in music-cms-mvp (pocketbase/pb_migrations/017_takes.js, 018_takes_songs.js).

export type Kind = 'inbox' | 'song' | 'idea' | 'binned'
export type Status = 'done' | 'working_on' | 'needs_work' | 'to_revisit'

export interface Take {
  id: string
  title: string
  audio: string
  duration: number
  peaks: number[] | null
  recorded_at: string
  source_path: string
  kind: Kind
  /** Ideas only; a song's status is on the song. */
  status: Status | ''
  tags: string[]
  notes: string
  sorted_at: string
  created: string
  updated: string
}

/** A song and its takes, best first. A take belongs to at most one song. */
export interface Song {
  id: string
  title: string
  status: Status | ''
  notes: string
  takes: string[]
  created: string
  updated: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Marker {
  id: string
  take: string
  seconds: number
  text: string
}

export type Collection = 'demo_takes' | 'demo_tags' | 'demo_markers' | 'demo_songs'

/** A change made on the phone, kept until the NAS has it. */
export type Op =
  | { kind: 'update'; col: Collection; id: string; data: Record<string, unknown> }
  | { kind: 'create'; col: Collection; id: string; data: Record<string, unknown> }
  | { kind: 'delete'; col: Collection; id: string }

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'working_on', label: 'Working on' },
  { value: 'needs_work', label: 'Needs work' },
  { value: 'to_revisit', label: 'To revisit' },
  { value: 'done', label: 'Done' },
]

export const STATUS_LABEL: Record<Status, string> = Object.fromEntries(
  STATUSES.map((s) => [s.value, s.label]),
) as Record<Status, string>

/** New songs start here unless picked otherwise in the sort sheet. */
export const DEFAULT_STATUS: Status = 'to_revisit'
