/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { WorkerReady, WorkerRequest, WorkerResponse } from './protocol'

type Db = {
  exec(opts: { sql: string; bind?: unknown[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown
}

/** A reloaded page can race the previous page's worker for the OPFS handles, so retry before giving up. */
async function installPool(sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>) {
  let last: unknown
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await sqlite3.installOpfsSAHPoolVfs({ name: 'tally' })
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw last
}

async function open(): Promise<{ db: Db; persistent: boolean }> {
  const sqlite3 = await sqlite3InitModule()
  try {
    const pool = await installPool(sqlite3)
    return { db: new pool.OpfsSAHPoolDb('/tally.sqlite3') as unknown as Db, persistent: true }
  } catch (e) {
    console.warn('OPFS unavailable, using in-memory database', e)
    return { db: new sqlite3.oo1.DB(':memory:') as unknown as Db, persistent: false }
  }
}

const ready = open()
const post = (m: WorkerReady | WorkerResponse) => self.postMessage(m)

ready.then(
  ({ persistent }) => post({ ready: true, persistent }),
  // e.g. the wasm file is missing after a deploy: tell the page instead of leaving it waiting forever.
  (e: unknown) => post({ ready: false, error: `Tally couldn't start its database: ${e instanceof Error ? e.message : String(e)}` }),
)

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
