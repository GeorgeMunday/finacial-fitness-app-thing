import Database from 'better-sqlite3'
import type { SqlExecutor } from '../src/db/executor'

export function memoryExecutor(): SqlExecutor {
  const d = new Database(':memory:')
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return d.prepare(sql).all(...(params as never[])) as T[]
    },
    async run(sql, params = []) {
      d.prepare(sql).run(...(params as never[]))
    },
    async exec(sql) {
      d.exec(sql)
    },
    async transaction(fn) {
      d.exec('BEGIN')
      try {
        await fn()
        d.exec('COMMIT')
      } catch (e) {
        d.exec('ROLLBACK')
        throw e
      }
    },
  }
}
