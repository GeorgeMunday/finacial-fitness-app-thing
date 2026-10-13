import { describe, expect, it, vi } from 'vitest'
import { createWorkerExecutor } from '../workerExecutor'
import type { WorkerRequest, WorkerResponse } from '../protocol'

class FakeWorker {
  sent: WorkerRequest[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onmessageerror: ((e: unknown) => void) | null = null
  terminated = false
  respond: (r: WorkerRequest) => WorkerResponse | null
  constructor(respond: (r: WorkerRequest) => WorkerResponse | null) {
    this.respond = respond
  }
  postMessage(r: WorkerRequest) {
    this.sent.push(r)
    const res = this.respond(r)
    if (res) queueMicrotask(() => this.onmessage?.({ data: res }))
  }
  terminate() {
    this.terminated = true
  }
  ready(persistent = true) {
    this.onmessage?.({ data: { ready: true, persistent } })
  }
}

const make = (respond: (r: WorkerRequest) => WorkerResponse | null) => {
  const w = new FakeWorker(respond)
  const p = createWorkerExecutor(w as unknown as Worker)
  w.ready()
  return { w, p }
}

describe('worker protocol', () => {
  it('resolves concurrent runs in order', async () => {
    const { w, p } = make((r) => ({ id: r.id, ok: true }))
    const db = await p
    const order: number[] = []
    await Promise.all([db.run('A').then(() => order.push(1)), db.run('B').then(() => order.push(2))])
    expect(order).toEqual([1, 2])
    expect(w.sent.map((s) => s.sql)).toEqual(['A', 'B'])
  })
  it('rejects on error responses', async () => {
    const { p } = make((r) => ({ id: r.id, ok: false, error: 'bad sql' }))
    const db = await p
    await expect(db.run('X')).rejects.toThrow('bad sql')
  })
  it('queues calls behind a running transaction', async () => {
    const { w, p } = make((r) => ({ id: r.id, ok: true }))
    const db = await p
    const tx = db.transaction(async (t) => {
      await t.run('INNER')
    })
    const outside = db.run('OUTSIDE')
    await Promise.all([tx, outside])
    expect(w.sent.map((s) => s.sql)).toEqual(['BEGIN', 'INNER', 'COMMIT', 'OUTSIDE'])
  })
  it('a call made from elsewhere during a transaction is not pulled into it', async () => {
    const { w, p } = make((r) => ({ id: r.id, ok: true }))
    const db = await p
    let stray: Promise<void> | undefined
    const tx = db.transaction(async (t) => {
      await t.run('FIRST')
      stray = db.run('STRAY') // e.g. another component writing while a restore runs
      await t.run('SECOND')
    })
    await tx
    await stray
    expect(w.sent.map((s) => s.sql)).toEqual(['BEGIN', 'FIRST', 'SECOND', 'COMMIT', 'STRAY'])
  })
  it('rolls back and rejects when the callback throws', async () => {
    const { w, p } = make((r) => ({ id: r.id, ok: true }))
    const db = await p
    await expect(db.transaction(async () => { throw new Error('nope') })).rejects.toThrow('nope')
    expect(w.sent.map((s) => s.sql)).toEqual(['BEGIN', 'ROLLBACK'])
  })
})

describe('worker startup failures', () => {
  it('rejects when the worker reports it could not start SQLite', async () => {
    const w = new FakeWorker(() => null)
    const p = createWorkerExecutor(w as unknown as Worker)
    w.onmessage?.({ data: { ready: false, error: 'wasm failed to load' } })
    await expect(p).rejects.toThrow('wasm failed to load')
    expect(w.terminated).toBe(true)
  })
  it('rejects when the worker script itself fails to load', async () => {
    const w = new FakeWorker(() => null)
    const p = createWorkerExecutor(w as unknown as Worker)
    w.onerror?.({ message: 'SyntaxError: import' })
    await expect(p).rejects.toThrow(/couldn't start/i)
  })
  it('rejects if the worker never says it is ready', async () => {
    vi.useFakeTimers()
    try {
      const w = new FakeWorker(() => null)
      const p = createWorkerExecutor(w as unknown as Worker, { timeoutMs: 20_000 })
      const caught = p.catch((e: Error) => e)
      await vi.advanceTimersByTimeAsync(20_001)
      expect(await caught).toBeInstanceOf(Error)
    } finally {
      vi.useRealTimers()
    }
  })
})
