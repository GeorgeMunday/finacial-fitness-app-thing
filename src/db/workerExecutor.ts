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

    // Direct (unqueued) executor, handed only to a transaction's callback while it holds the queue.
    const direct: SqlExecutor = {
      all: async <T,>(sql: string, params?: unknown[]) => ((await rpc('all', sql, params)) ?? []) as T[],
      run: async (sql, params) => void (await rpc('run', sql, params)),
      exec: async (sql) => void (await rpc('exec', sql)),
      transaction: () => Promise.reject(new Error('Nested transactions are not supported')),
    }

    const exec: WorkerExecutor = {
      get persistent() {
        return persistent
      },
      all: <T,>(sql: string, params?: unknown[]) => enqueue(() => direct.all<T>(sql, params)),
      run: (sql, params) => enqueue(() => direct.run(sql, params)),
      exec: (sql) => enqueue(() => direct.exec(sql)),
      transaction: (fn) =>
        enqueue(async () => {
          await rpc('exec', 'BEGIN')
          try {
            await fn(direct)
            await rpc('exec', 'COMMIT')
          } catch (e) {
            await rpc('exec', 'ROLLBACK').catch(() => {})
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
