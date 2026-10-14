export type RecipeTag = 'batch' | 'quick' | 'breakfast' | 'lunch' | 'dinner' | 'freezer-friendly'
export const RECIPE_TAGS: RecipeTag[] = ['batch', 'quick', 'breakfast', 'lunch', 'dinner', 'freezer-friendly']

export type Nutrition = {
  kcal: number; proteinG: number; carbsG: number; fatG: number
  /** null when any ingredient doesn't know it */
  fibreG: number | null; sugarsG: number | null; saltG: number | null
}

export type RecipeItem = { foodId: string; name: string; grams: number }

export type Recipe = {
  id: string
  key: string | null
  name: string
  description: string | null
  servings: number
  prepMinutes: number | null
  cookMinutes: number | null
  steps: string[]
  tags: RecipeTag[]
  fridgeDays: number | null
  source: 'tally' | 'user'
  items: RecipeItem[]
}

export type NewRecipe = Omit<Recipe, 'id' | 'key' | 'source' | 'items'> & { items: { foodId: string; grams: number }[] }

/** Cost in whole pence. `complete` is false when an ingredient has no price (named in `missing`). */
export type RecipeCost = {
  perPortionPence: number
  totalPence: number
  complete: boolean
  missing: string[]
  /** For example "October 2026" when any price used is an estimate; null when every price is the user's own. */
  estimatedMonth: string | null
}

export type RecipeSummary = Recipe & { nutrition: Nutrition; cost: RecipeCost; proteinPerPound: number | null }
