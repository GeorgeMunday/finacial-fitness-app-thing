import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SqlExecutor } from '../src/db/executor'
import { migrate } from '../src/db/migrations'
import { seedAll, type SeedData } from '../src/domain/seed'
import { memoryExecutor } from './memoryExecutor'

const file = <T,>(name: string, optional = false): T | null => {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'public/seed', name), 'utf8')) as T
  } catch (e) {
    if (optional) return null
    throw e
  }
}

/** The bundled seed files exactly as the app ships them. */
export const realSeed = (): SeedData => ({
  starter: file('starter.json')!, cofid: [], exercises: file('exercises.json')!,
  programmes: file<unknown[]>('programmes.json', true) ?? [], recipes: file('recipes.json', true),
})

export async function seededDb(): Promise<SqlExecutor> {
  const db = memoryExecutor()
  await migrate(db)
  await seedAll(db, realSeed())
  return db
}
