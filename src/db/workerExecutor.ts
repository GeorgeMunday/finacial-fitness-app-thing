import type { SqlExecutor } from './executor'
import type { WorkerReady, WorkerRequest, WorkerResponse } from './protocol'

export type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((e: MessageEvent | { data: unknown }) => void) | null
}
export type WorkerExecutor = SqlExecutor & { persistent: boolean; close(): void }

export function createWorkerExecutor(worker: Worker): Promise<WorkerExecutor> {
  const w = worker as unknown as WorkerLike
  return new Promise((resolveReady) => {
    let nextId = 1
    const pending = new Map<number, { resolve: (rows?: unknown[]) => void; reject: (e: Error) => void }>()
    let persistent = false

    // Serialises every call: a transaction holds the queue until it finishes.
    let tail: Promise<unknown> = Promise.resolve()
    const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
      const next = tail.then(fn, fn)
      tail = next.catch(() => {})
      return next
    }

    const rpc = (op: WorkerRequest['op'], sql: string, params?: unknown[]) =>
      new Promise<unknown[] | undefined>((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        w.postMessage({ id, op, sql, params } satisfies WorkerRequest)
      })

    // Inside a transaction callback, calls must bypass the queue (it is held).
    let inTx = false
    const call = <T>(fn: () => Promise<T>) => (inTx ? fn() : enqueue(fn))

    const exec: WorkerExecutor = {
      get persistent() {
        return persistent
      },
      all: <T>(sql: string, params?: unknown[]) =>
        call(async () => ((await rpc('all', sql, params)) ?? []) as T[]),
      run: (sql, params) => call(async () => void (await rpc('run', sql, params))),
      exec: (sql) => call(async () => void (await rpc('exec', sql))),
      transaction: (fn) =>
        enqueue(async () => {
          await rpc('exec', 'BEGIN')
          inTx = true
          try {
            await fn()
            inTx = false
            await rpc('exec', 'COMMIT')
          } catch (e) {
            inTx = false
            await rpc('exec', 'ROLLBACK')
            throw e
          }
        }),
      close: () => worker.terminate(),
    }

    w.onmessage = (e) => {
      const data = e.data as WorkerReady | WorkerResponse
      if ('ready' in data) {
        persistent = data.persistent
        w.onmessage = (ev) => {
          const r = ev.data as WorkerResponse
          const p = pending.get(r.id)
          if (!p) return
          pending.delete(r.id)
          if (r.ok) p.resolve(r.rows)
          else p.reject(new Error(r.error))
        }
        resolveReady(exec)
      }
    }
  })
}

export function openWorkerExecutor(): Promise<WorkerExecutor> {
  return createWorkerExecutor(new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' }))
}
