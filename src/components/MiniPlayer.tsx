import { Pause, Play, SkipForward, X } from 'lucide-react'
import { clock } from '../lib/format'
import { load, stop, toggle, usePlayer } from '../lib/player'
import { library, useStore } from '../lib/store'

export function MiniPlayer({ onOpen }: { onOpen: (id: string) => void }) {
  const takeId = usePlayer((p) => p.takeId)
  const playing = usePlayer((p) => p.playing)
  const time = usePlayer((p) => p.time)
  const duration = usePlayer((p) => p.duration)
  const queue = usePlayer((p) => p.queue)
  const take = useStore((s) => library(s).takes[takeId])
  if (!take) return null
  const progress = duration ? Math.min(1, time / duration) : 0

  return (
    <div className="relative mx-3 mb-2 overflow-hidden rounded-2xl border-[1.5px] border-ink bg-surface">
      <div className="absolute inset-y-0 left-0 bg-accent-container" style={{ width: `${progress * 100}%` }} aria-hidden />
      <div className="relative flex items-center gap-2 px-2 py-1.5">
        <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sun text-ink" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
          {playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
        </button>
        <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => onOpen(take.id)}>
          <span className="truncate text-sm font-semibold">{take.title}</span>
          <span className="text-xs text-ink-variant tabular-nums">
            {clock(time)} / {clock(duration)}
            {queue.length ? ` · ${queue.length} more` : ''}
          </span>
        </button>
        {queue.length > 0 && (
          <button type="button" className="rounded-full p-2 text-ink-variant" aria-label="Next" onClick={() => void load(queue[0], { autoplay: true, queue: queue.slice(1) })}>
            <SkipForward size={18} />
          </button>
        )}
        <button type="button" className="rounded-full p-2 text-ink-variant" aria-label="Stop" onClick={stop}>
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
