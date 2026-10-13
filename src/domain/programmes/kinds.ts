import { doubleKind } from './double'
import { gzclpKind } from './gzclp'
import { linearKind } from './linear'
import type { ProgressionKind } from './kindTypes'
import type { ProgressionKindName } from './types'

export type { EvaluateArgs, LiftUpdate, ProgressionKind } from './kindTypes'
export { plainSets } from './kindTypes'

export const KINDS: Partial<Record<ProgressionKindName, ProgressionKind>> = { double: doubleKind, linear: linearKind, gzclp: gzclpKind }
