import type { SqlExecutor } from './executor'
import { migrate } from './migrations'
import { openWorkerExecutor } from './workerExecutor'

let opening: Promise<{ db: SqlExecutor; persistent: boolean }> | undefined

/** One database per page: a second worker would fight the first for the OPFS file handles. */
export function openAppDb(): Promise<{ db: SqlExecutor; persistent: boolean }> {
  opening ??= (async () => {
    const db = await openWorkerExecutor()
    await migrate(db)
    return { db, persistent: db.persistent }
  })()
  return opening
}
