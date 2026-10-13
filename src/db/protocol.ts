export type WorkerRequest = { id: number; op: 'all' | 'run' | 'exec'; sql: string; params?: unknown[] }
export type WorkerResponse =
  | { id: number; ok: true; rows?: unknown[] }
  | { id: number; ok: false; error: string }
export type WorkerReady = { ready: true; persistent: boolean } | { ready: false; error: string }
