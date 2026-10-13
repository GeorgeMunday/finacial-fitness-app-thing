import { plainSets, type ProgressionKind } from './kindTypes'

/** Linear progression: add weight after every successful session; three failures in a row mean a 10% deload. */
export const linearKind: ProgressionKind = {
  prescribe: (row, state) => plainSets(row, row.tier === 'bw' ? 0 : (state?.weightKg ?? 0)),
  evaluate: () => {
    throw new Error('Not implemented')
  },
}
