export type TxKind = 'expense' | 'income'
export type CategoryKind =
  | 'groceries' | 'eating_out' | 'takeaway' | 'fitness' | 'supplements'
  | 'bills' | 'transport' | 'shopping' | 'income' | 'other'
export type GoalPeriod = 'month' | 'year' | 'once'
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Sex = 'female' | 'male' | 'unspecified'
export type FoodSource = 'user' | 'off' | 'cofid' | 'starter'

export type Base = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null }

export type Category = Base & { name: string; kind: CategoryKind }
export type Transaction = Base & {
  kind: TxKind; logDate: string; amountPence: number; currency: string
  merchant: string | null; categoryId: string; note: string | null; source: string | null
}
export type SavingsGoal = Base & {
  name: string; period: GoalPeriod; targetPence: number
  startDate: string | null; targetDate: string | null; archivedAt: string | null
}
export type Food = Base & {
  source: FoodSource; barcode: string | null; name: string; brand: string | null
  kcal100g: number; protein100g: number; carbs100g: number; fat100g: number
  servingG: number | null; servingLabel: string | null
}
export type FoodLog = Base & {
  logDate: string; slot: Slot; foodId: string | null; grams: number | null
  kcal: number; proteinG: number; carbsG: number; fatG: number
  recipeId: string | null; portions: number | null
  /** Only quick adds have one; foods and recipes are named by what they point at. */
  name: string | null
}
