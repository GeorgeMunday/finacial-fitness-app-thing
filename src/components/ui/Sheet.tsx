import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const startY = useRef<number | null>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-[20px] bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (startY.current !== null && e.changedTouches[0].clientY - startY.current > 80) onClose()
          startY.current = null
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <Button variant="quiet" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  )
}
