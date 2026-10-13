import { emitChange } from '../../state/changes'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ShowOpts = { undo?: () => unknown; action?: { label: string; run: () => unknown } }
type ToastApi = { show(message: string, opts?: ShowOpts): void }
const Ctx = createContext<ToastApi>({ show: () => {} })

export const useToast = (): ToastApi => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; label: string; run?: () => unknown; key: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keyRef = useRef(0)

  const close = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])
  const show = useCallback((message: string, opts?: ShowOpts) => {
    clearTimeout(timer.current)
    const undo = opts?.undo
    // After an Undo, tell every mounted list to re-read: the screen that made the change may be gone.
    const run = undo ? () => Promise.resolve(undo()).then(emitChange) : opts?.action?.run
    setToast({ message, label: undo ? 'Undo' : (opts?.action?.label ?? ''), run, key: ++keyRef.current })
    timer.current = setTimeout(() => setToast(null), 5000)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const api = useMemo(() => ({ show }), [show])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
        {toast ? (
          <div key={toast.key} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink px-4 py-2 text-chalk shadow-lg">
            <span>{toast.message}</span>
            {toast.run ? (
              <button
                className="min-h-11 min-w-11 font-semibold underline"
                onClick={() => {
                  close()
                  void toast.run?.()
                }}
              >
                {toast.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  )
}
