export type ProgressionKindName = 'double' | 'linear' | 'gzclp' | 'wendler531'
export type Tier = 'main' | 'bw' | 't1' | 't2' | 't3' | 'm531' | 'fsl' | 'assist'

export type Programme = {
  id: string
  key: string
  name: string
  author: string | null
  level: 'beginner' | 'intermediate'
  description: string
  progression: ProgressionKindName
  daysPerWeekOptions: number[]
  source: 'tally' | 'user'
}

export type ProgrammeDay = { id: string; programmeId: string; position: number; name: string }

export type DayExercise = {
  id: string
  dayId: string
  position: number
  exerciseId: string
  altExerciseId: string | null
  liftKey: string
  tier: Tier
  sets: number
  repMin: number
  repMax: number
  percent: number | null
  week: number | null
  isAmrap: boolean
  incrementKg: number | null
  note: string | null
}

/** What the app remembers about one lift. `stage` is 1-based (GZCLP); `stageStartKg` is where it last entered stage 1. */
export type LiftState = { weightKg: number; stage: number; stageStartKg: number; fails: number; trainingMaxKg?: number }

export type ProgrammeProgress = {
  id: string
  programmeId: string
  active: boolean
  startedOn: string | null
  daysPerWeek: number | null
  nextPosition: number
  cycleWeek: number
  lifts: Record<string, LiftState>
}

export type SeedDayExercise = {
  exercise: string
  alt?: string | null
  tier: Tier
  sets: number
  reps: [number, number]
  lift?: string
  amrap?: boolean
  incrementKg?: number
  note?: string
}
export type SeedCycleWeek = { percents: number[]; reps: number[]; fslPercent: number }
export type SeedProgramme = {
  key: string
  name: string
  author?: string | null
  level: 'beginner' | 'intermediate'
  progression: ProgressionKindName
  daysPerWeekOptions: number[]
  description: string
  days: { name: string; exercises: SeedDayExercise[] }[]
  cycle?: { weeks: SeedCycleWeek[] }
}

export type PlannedSet = { reps: number; minReps: number; maxReps: number; weightKg: number; amrap: boolean }
export type PlannedExercise = {
  dayExerciseId: string
  exerciseId: string
  altExerciseId: string | null
  name: string
  tier: Tier
  liftKey: string
  sets: PlannedSet[]
  note: string | null
}
export type NextWorkout = {
  programmeId: string
  programmeName: string
  dayId: string
  dayName: string
  dayNumber: number
  daysInRotation: number
  plannedPerWeek: number
  doneThisWeek: number
  doneToday: boolean
  cycleWeek: number | null
  openWorkoutId: string | null
}

export type ProgressionResult = 'progressed' | 'held' | 'incomplete' | 'not_done' | 'stage_change' | 'deload' | 'reset' | 'retest' | 'cycle_up'
export type ProgressionOutcome = { liftKey: string; exerciseId: string; name: string; result: ProgressionResult; fromKg: number; toKg: number; note?: string }
