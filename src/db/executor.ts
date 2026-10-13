export interface SqlExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<void>
  exec(sql: string): Promise<void>
  transaction(fn: () => Promise<void>): Promise<void>
}
