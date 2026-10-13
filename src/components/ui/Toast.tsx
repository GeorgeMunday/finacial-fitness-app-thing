import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ShowOpts = { undo?: () => void }
type ToastApi = { show(message: string, opts?: ShowOpts): void }
const Ctx = createContext<ToastApi>({ show: () => {} })

export const useToast = (): ToastApi => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; undo?: () => void; key: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keyRef = useRef(0)

  const close = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])
  const show = useCallback((message: string, opts?: ShowOpts) => {
    clearTimeout(timer.current)
    setToast({ message, undo: opts?.undo, key: ++keyRef.current })
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
            {toast.undo ? (
              <button
                className="min-h-11 min-w-11 font-semibold underline"
                onClick={() => {
                  toast.undo?.()
                  close()
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  )
}
