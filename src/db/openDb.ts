import type { SqlExecutor } from './executor'
import { migrate } from './migrations'
import { openWorkerExecutor } from './workerExecutor'

export async function openAppDb(): Promise<{ db: SqlExecutor; persistent: boolean }> {
  const db = await openWorkerExecutor()
  await migrate(db)
  return { db, persistent: db.persistent }
}
