import Database from 'better-sqlite3'
import type { SqlExecutor } from '../src/db/executor'

export function memoryExecutor(): SqlExecutor {
  const d = new Database(':memory:')
  let txTail: Promise<unknown> = Promise.resolve()
  const self: SqlExecutor = {
    async all<T>(sql: string, params: unknown[] = []) {
      return d.prepare(sql).all(...(params as never[])) as T[]
    },
    async run(sql, params = []) {
      d.prepare(sql).run(...(params as never[]))
    },
    async exec(sql) {
      d.exec(sql)
    },
    transaction(fn) {
      // Serialise transactions like the worker executor does.
      const run = async () => {
      d.exec('BEGIN')
      try {
        await fn(self)
        d.exec('COMMIT')
      } catch (e) {
        d.exec('ROLLBACK')
        throw e
      }
      }
      const next = txTail.then(run, run)
      txTail = next.catch(() => {})
      return next
    },
  }
  return self
}
