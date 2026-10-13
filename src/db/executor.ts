export interface SqlExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<void>
  exec(sql: string): Promise<void>
  /** Runs fn inside BEGIN…COMMIT. Use the `tx` it is given for every statement in the transaction:
   *  calls on the outer executor wait until the transaction has finished. */
  transaction(fn: (tx: SqlExecutor) => Promise<void>): Promise<void>
}
