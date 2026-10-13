import { describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import { newId } from '../ids'

describe('memoryExecutor', () => {
  it('inserts and reads rows', async () => {
    const db = memoryExecutor()
    await db.exec('CREATE TABLE t(a INTEGER)')
    await db.run('INSERT INTO t VALUES (?)', [1])
    await db.run('INSERT INTO t VALUES (?)', [2])
    expect(await db.all('SELECT * FROM t')).toHaveLength(2)
  })
  it('rolls back a failing transaction', async () => {
    const db = memoryExecutor()
    await db.exec('CREATE TABLE t(a INTEGER)')
    await expect(
      db.transaction(async () => {
        await db.run('INSERT INTO t VALUES (1)')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await db.all('SELECT * FROM t')).toHaveLength(0)
  })
  it('newId makes uuids', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/)
    expect(newId()).not.toBe(newId())
  })
})
