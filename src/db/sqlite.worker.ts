/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { WorkerReady, WorkerRequest, WorkerResponse } from './protocol'

type Db = {
  exec(opts: { sql: string; bind?: unknown[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown
}

async function open(): Promise<{ db: Db; persistent: boolean }> {
  const sqlite3 = await sqlite3InitModule()
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'tally' })
    return { db: new pool.OpfsSAHPoolDb('/tally.sqlite3') as unknown as Db, persistent: true }
  } catch (e) {
    console.warn('OPFS unavailable, using in-memory database', e)
    return { db: new sqlite3.oo1.DB(':memory:') as unknown as Db, persistent: false }
  }
}

const ready = open()
const post = (m: WorkerReady | WorkerResponse) => self.postMessage(m)

ready.then(({ persistent }) => post({ ready: true, persistent }))

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, op, sql, params } = e.data
  try {
    const { db } = await ready
    if (op === 'all') {
      const rows = db.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' }) as unknown[]
      post({ id, ok: true, rows })
    } else {
      db.exec({ sql, bind: op === 'run' ? params : undefined })
      post({ id, ok: true })
    }
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
