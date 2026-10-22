import { useMemo, useRef } from 'react'

interface WaveformProps {
  peaks: number[] | null
  /** 0..1 of the way through. */
  progress: number
  bars?: number
  height?: number
  onSeek?: (fraction: number) => void
  markers?: number[]
  className?: string
}

/** Max-pools the stored peaks down to the number of bars drawn. */
function pool(peaks: number[], bars: number): number[] {
  if (peaks.length <= bars) return peaks
  const out: number[] = []
  const size = peaks.length / bars
  for (let i = 0; i < bars; i++) {
    let m = 0
    for (let j = Math.floor(i * size); j < Math.floor((i + 1) * size); j++) m = Math.max(m, peaks[j])
    out.push(m)
  }
  return out
}

export function Waveform({ peaks, progress, bars = 64, height = 64, onSeek, markers = [], className = '' }: WaveformProps) {
  const ref = useRef<SVGSVGElement>(null)
  const values = useMemo(() => {
    const p = peaks?.length ? peaks : Array.from({ length: bars }, () => 0.15)
    return pool(p, bars)
  }, [peaks, bars])

  const seekFrom = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || !onSeek) return
    onSeek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
  }

  const playedBars = progress * values.length
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${values.length * 3} 100`}
      preserveAspectRatio="none"
      className={`block w-full touch-none ${onSeek ? 'cursor-pointer' : ''} ${className}`}
      style={{ height }}
      role={onSeek ? 'slider' : 'img'}
      aria-label="Waveform"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={(e) => {
        if (!onSeek) return
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        seekFrom(e.clientX)
      }}
      onPointerMove={(e) => {
        if (onSeek && e.buttons) {
          e.stopPropagation()
          seekFrom(e.clientX)
        }
      }}
    >
      {values.map((v, i) => {
        const h = Math.max(6, v * 96)
        return (
          <rect
            key={i}
            x={i * 3 + 0.5}
            y={50 - h / 2}
            width={2}
            height={h}
            rx={1}
            className={i < playedBars ? 'fill-ink' : 'fill-accent/45'}
          />
        )
      })}
      {markers.map((m, i) => (
        <rect key={`m${i}`} x={m * values.length * 3 - 0.75} y={0} width={1.5} height={100} className="fill-sun" />
      ))}
    </svg>
  )
}
