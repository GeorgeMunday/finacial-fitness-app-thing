import { plainSets, type ProgressionKind } from './kindTypes'

/** Double progression: add weight once every set reaches the top of its rep range. */
export const doubleKind: ProgressionKind = {
  prescribe: (row, state) => plainSets(row, state?.weightKg ?? 0),
  evaluate: () => {
    throw new Error('Not implemented')
  },
}
