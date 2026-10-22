import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
}

// Same sheet as Mise and Priorities (src/components/ui/BottomSheet.tsx there).
export function BottomSheet({ isOpen, onClose, title, children, footer }: BottomSheetProps) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-[520px] flex-col self-end rounded-t-[28px] border-2 border-b-0 border-ink bg-surface shadow-xl">
        <div className="flex shrink-0 flex-col items-center pt-2.5">
          <svg viewBox="0 0 44 8" aria-hidden className="h-2 w-11 fill-none stroke-ink-variant">
            <path d="M2 4 Q7.5 0 13 4 T24 4 T35 4 T42 4" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {title && (
            <div className="mt-2 flex w-full items-center justify-between px-4 pb-2">
              <h2 className="heading-section">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-variant active:bg-surface-variant">
                <X size={22} />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t-[1.5px] border-outline px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}
