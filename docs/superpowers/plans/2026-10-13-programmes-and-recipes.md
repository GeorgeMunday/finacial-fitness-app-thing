# Programmes and Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-loaded workout programmes (five of them, with suggested weights and automatic progression) to Train, and 12 pre-planned high-protein recipes with computed nutrition, estimated cost, one-tap logging and a weekly shopping list to Food.

**Architecture:** Programmes and recipes are seed data (`public/seed/programmes.json`, `recipes.json`) loaded additively into new SQLite tables (one migration). All logic lives in pure TypeScript modules under `src/domain/programmes/` and `src/domain/recipes/` that talk to the database through the existing `SqlExecutor`; screens are thin React routes on top. Progression is one small module per programme kind registered in a `KINDS` table, so each kind is tested on its own. Nutrition and cost are always computed from the food and price tables, never stored on the recipe.

**Tech Stack:** The existing app: Vite, React, TypeScript strict, react-router, Tailwind v4, Vitest + Testing Library, better-sqlite3 for tests, `lucide-react` icons. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-programmes-and-recipes-brief.md` (the product owner's brief, verbatim). The base product plan is `docs/plans/2026-10-12-tally-mvp.md`: read its **Design system and UX fundamentals** section and its **Amendments** section (the amendments override the text around them) before building any screen.

## Global Constraints

Copied from the base plan; every task includes them.

- **Local-only:** no backend, no accounts, no cloud sync, no analytics, ads or third-party tracking. The only network requests after the app is installed are Open Food Facts barcode lookups, and the app works fully offline otherwise (service worker precaches the app shell, WASM and seed data).
- **Expense tracker first:** the Money pillar is always on and cannot be disabled. Food and Train are optional pillars.
- Mobile-first layout (designed at 375 px wide, usable up to desktop); bottom navigation and primary actions in the lower third of the screen.
- Money is stored as integer pence (`amount_pence INTEGER`, always positive) with `currency TEXT DEFAULT 'GBP'`; never floats.
- Every row has `id TEXT PRIMARY KEY` (`crypto.randomUUID()`), `created_at`, `updated_at` (ISO 8601 UTC strings) and `deleted_at` (nullable). Deletes are soft; every query filters `deleted_at IS NULL`.
- Day boundaries use the device's local date as `log_date TEXT 'YYYY-MM-DD'`. Weeks start on Monday; months are calendar months; savings years are calendar years (1 Jan – 31 Dec).
- Each food log stores a snapshot of kcal, protein_g, carbs_g, fat_g at logging time; editing or deleting a food never changes past logs.
- User-created foods live in `foods` with `source = 'user'`; Open Food Facts rows use `source = 'off'`, CoFID rows `source = 'cofid'`, and Tally's hand-written starter list `source = 'starter'`. Never merge user edits into `off` rows — write a new `user` row instead.
- CoFID data is CC BY-NC-SA 4.0 (non-commercial). Do not add any payment or subscription code in this plan.
- No red "over target" colours for food, no "good/bad food" language. A "Hide calorie numbers" setting hides kcal everywhere in food screens and the Today card.
- Savings goal progress bars and budget states never use red; use neutral and accent colours (amber text is the only warning colour; red is used only in the typed-confirmation delete dialog).
- Tap budgets: log a recent food in ≤ 3 taps, complete a pre-filled set in 1 tap.
- All UI follows the "Design system and UX fundamentals" section of the base plan and uses the existing `src/components/ui/*` components: tokens and fonts, list rows rather than cards, sentence case, one toast per save with Undo, buttons named for what they do, empty states that invite action, errors that say what happened and what to do.
- Touch targets ≥ 44×44 px; every icon-only button has `aria-label`; text sizes in `rem`; visible focus states; respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Async buttons use `src/components/ui/Button.tsx` (it ignores repeat taps while a save runs). Screens read local data with `useAsync` and show no spinners.
- The bottom nav is Today · Money · (Add) · Food · Train, with the profile behind the avatar on Today. Do not add tabs; reach new screens from the Train and Food screens.

New in this plan (from the brief):

- Write all programme and recipe descriptions, steps and notes in your own words. Credit the original author in the programme's `author` field and description where a programme has one (Brandon Campbell, Cody Lefever, Jim Wendler). Do not copy text from websites. Do not scrape supermarket sites.
- Every recipe: at least 30 g protein per portion; estimated cost at most £2.00 a portion; batch recipes make 3–5 portions; quick recipes need 15 minutes or less of hands-on time; every recipe has ingredients in grams, short numbered steps, prep and cook time, portions, tags and fridge days.
- Nutrition per portion is computed from the ingredients in the foods table. Any ingredient missing from the foods table is added to the starter seed with `source = 'starter'` (never presented as CoFID).
- Prices are seeded as estimates with the note "Prices estimated October 2026" and are editable per ingredient. Show cost per portion and protein per £.
- Recipe screens respect "Hide calorie numbers" and never use the words clean, guilt-free, cheat, junk, sinful or naughty.

## Planning decisions

Made while planning. The first is an open question for the product owner; everything else follows from the brief and can be changed in review.

- **Q1 (open, needs a yes/no): skipped sets versus failed sets.** Progression for Linear and GZCLP T1/T2 needs to know when a lift was *missed*. Today's logging cannot say: a set needs at least 1 rep, and a set that was skipped looks the same as a set that was never reached. Missing *reps* on a logged set is an automatic miss. Missing *sets* is ambiguous, so: when a workout is finished with fewer sets than prescribed for such a lift (and every logged set hit its reps), the app asks "Count this as a miss?" per lift, and the default is "Don't count" (never penalise silently). Set logging itself does not change. Double progression, GZCLP T3 and 5/3/1 never ask: a short lift simply doesn't progress.
- Stop-condition checks done: all 28 exercises in the brief exist in free-exercise-db (names in Task 3), plus `Pushups` and `Plank` for the 5/3/1 assistance defaults; all 12 recipes reach ≥ 30 g protein at ≤ £2.00 a portion with the estimated prices in Task 12 (most expensive £1.82, lowest protein 35.0 g).
- **A lift is judged on the first N working sets** (non-warm-up, by `set_number`) of the *prescribed* exercise in that workout, N = prescribed sets. Extra sets are ignored. A swapped lift has no sets for the prescribed exercise, so it is untouched. Weights are compared with a 0.05 kg tolerance so lb rounding never causes a false miss. On success the new weight is built from the lightest weight actually lifted in those N sets.
- **Increments:** a "step" is 2.5 kg, or 5 lb for lb users. Double progression, GZCLP and the 5/3/1 training max add 1 step to upper-body lifts and 2 steps to lower-body lifts (so 2.5/5 kg, or 5/10 lb). Linear adds 1 step to every lift except the deadlift, which adds 2 (rows carry `increment_kg` for this). Lower body = free-exercise-db primary muscle in {quadriceps, hamstrings, glutes, calves, lower back, adductors, abductors}.
- **GZCLP:** a T1 miss moves to the next stage at the same weight (5×3 → 6×2 → 10×1); a miss at 10×1 is the retest: back to 5×3 at 85% of the current weight, rounded. A T2 miss moves 3×10 → 3×8 → 3×6; a miss at 3×6 resets to 3×10 at the weight where the lift last started 3×10 plus 2 steps (5 kg / 10 lb). T1/T2 success adds the increment and stays on the stage. T3 adds the increment only when the last set reaches 25 reps; it has no failure state. Each tier of a lift has its own state (Bench is T2 on Day 1 and T1 on Day 3).
- **5/3/1:** one rotation of the three days is one week. After Day 3 the week advances; after week 3 the training maxes rise once (+2 steps lower body, +1 step upper) and the cycle restarts. AMRAP sets have no failure rule. The 5×5 "first set last" uses the week's first-set percentage (65, 70, 75). Assistance is three slots of 5 sets × 10–20 reps ("aim for 50–100 reps in total") with default exercises the user can swap.
- **Rotation:** finishing a programme workout moves the pointer to the day after the one just finished and wraps. PPL's 3 or 6 days a week only changes the "x of N this week" count; the rotation is Push, Pull, Legs either way.
- **Prefill:** each prescribed set is prefilled with the day's suggested weight and the *minimum* reps of its range, so one tap logs "as planned" without claiming top-of-range reps; AMRAP sets prefill their minimum.
- **"I don't know" defaults** (light, empty-bar starting points; kg, converted for lb): barbell 20, e-z curl bar 10, dumbbell 6 (lateral raise 3), cable 15 (lat pulldown 25, seated cable row 25, face pull 10, triceps pushdown 15), machine 20 (leg press 40, standing calf raise 30), bodyweight 0. 5/3/1 training maxes: squat, bench press, deadlift 40; overhead press 30. If the user has logged that lift before, 5/3/1 uses 90% of their best estimated 1RM instead.
- **Seeding is additive**, keyed by (source, name) for foods, name for exercises and `key` for programmes and recipes, so people who already seeded get the new content without duplicates and without losing anything.
- **Prices** live in `product_prices`: `pack_g` is the edible grams in the pack and `price_pence` its estimated price; the latest row per food wins; seeded rows have `source = 'estimate'`, user edits `source = 'user'`. Cost is by weight (total ÷ servings), and the shopping list says so.
- **Recipe logs** write one `food_logs` row per `logRecipe` call (`food_id` null, `recipe_id` set, `portions` set, nutrition snapshot = per-portion × portions). Editing a recipe, a food or a price never changes past logs.
- **Plan my week** keeps its picks in screen state only (nothing is stored).

## Review Focus

Each line has a test in the task named in brackets.

1. **People who already use Tally get the new content once, with nothing lost or duplicated**: existing starter foods and exercises are kept, new ones are added by name, seeding twice adds nothing, and restoring a backup made before this release (no programme tables) works and then re-seeds. [Tasks 1, 2, 3, 12]
2. **An abandoned, edited or half-done workout never changes a lift**: unfinished workouts, swapped lifts, skipped sets, extra sets, warm-ups, applying progression twice, and lb rounding all leave weights alone or progress them correctly; shortfalls ask before counting as a miss. [Tasks 5, 6, 9]
3. **Switching programmes is safe**: starting a second programme keeps the first one's state, only one is active, `nextWorkout` is null with none, the rotation wraps, and the 5/3/1 cycle rollover raises each training max exactly once even though Bench and Squat appear on two days. [Tasks 4, 5, 7]
4. **Recipes survive missing data**: an ingredient whose food was deleted or has no price doesn't crash anything, cost says it is incomplete, fractional portions (0.5) work, and a recipe with 0 servings is refused. [Tasks 11, 13]
5. **Safety language holds everywhere**: with "Hide calorie numbers" on, no recipe card, recipe page, shopping list or toast shows kcal; no seeded text contains the banned words; programme and recipe text carries no URLs. [Tasks 8, 12, 13, 14]

## File structure

Create:
- `src/domain/programmes/types.ts`: types for programmes, days, rows, lift state and outcomes.
- `src/domain/programmes/rounding.ts`: `stepKg`, `roundKg`, `incrementKg`, `isLowerBody`.
- `src/domain/programmes/catalog.ts`: list, get, active programme, copy to routines.
- `src/domain/programmes/start.ts`: lifts to ask about, defaults, `startProgramme`.
- `src/domain/programmes/plan.ts`: `nextWorkout`, `suggestWeights`, `startProgrammeWorkout`.
- `src/domain/programmes/kinds.ts`: the `ProgressionKind` interface and the `KINDS` registry.
- `src/domain/programmes/double.ts`, `linear.ts`, `gzclp.ts`, `wendler.ts`: one kind each.
- `src/domain/programmes/progression.ts`: `applyProgression`, `progressionShortfalls`.
- `src/domain/programmes/seedProgrammes.ts`: seeds `programmes.json` rows.
- `src/domain/recipes/types.ts`, `recipes.ts` (CRUD, nutrition, cost, logging), `prices.ts`, `shopping.ts`, `seedRecipes.ts`.
- `public/seed/programmes.json`, `public/seed/recipes.json`.
- Screens: `src/routes/train/Programmes.tsx`, `ProgrammeDetail.tsx`, `src/components/train/NextWorkoutCard.tsx`, `src/components/train/ShortfallSheet.tsx`, `src/routes/food/Recipes.tsx`, `RecipeDetail.tsx`, `RecipeEdit.tsx`, `PlanWeek.tsx`.

Modify: `src/db/migrations.ts`, `src/db/types.ts`, `src/domain/seed.ts`, `src/domain/backup.ts`, `src/domain/food.ts`, `src/domain/training.ts`, `src/AppRoutes.tsx`, `src/components/RestoreFromBackup.tsx`, `src/routes/Train.tsx`, `src/routes/train/Workout.tsx`, `src/routes/train/Routine.tsx`, `src/routes/Food.tsx`, `src/routes/money/AddTransaction.tsx`, `scripts/build-seed.ts`, `public/seed/starter.json`, `public/seed/exercises.json`, `docs/manual-testing.md`.

---

### Task 1: Migration 3, row types and backup upgrade

**Files:**
- Modify: `src/db/migrations.ts`, `src/db/types.ts`, `src/domain/food.ts`, `src/domain/training.ts`, `src/domain/backup.ts`
- Test: `src/db/__tests__/migrations.test.ts`, `src/domain/__tests__/backup.test.ts`, `src/domain/__tests__/food.test.ts`

**Interfaces:**
- Produces: `MIGRATIONS[2]` (schema version 3); `FoodLog` gains `recipeId: string | null` and `portions: number | null`; `getWorkout(db, id)` returns `{ id, routineId, endedAt, logDate, programmeDayId: string | null }`; `insertLog`/`copyDay` carry `recipe_id` and `portions`.

Schema (all new tables have the base columns `id, created_at, updated_at, deleted_at`):
- `workouts` += `programme_day_id TEXT`, `progression_applied_at TEXT`.
- `programmes(key TEXT NOT NULL UNIQUE, name, author TEXT, level CHECK in beginner|intermediate, description NOT NULL, progression CHECK in double|linear|gzclp|wendler531, days_per_week_options TEXT NOT NULL /*JSON*/, source CHECK in tally|user DEFAULT 'tally', parent_id TEXT)`.
- `programme_days(programme_id, position INTEGER, name)`.
- `programme_day_exercises(day_id, position, exercise_id, alt_exercise_id TEXT, lift_key TEXT NOT NULL, tier CHECK in main|bw|t1|t2|t3|m531|fsl|assist, sets INTEGER, rep_min INTEGER, rep_max INTEGER, percent REAL, week INTEGER, is_amrap INTEGER DEFAULT 0, increment_kg REAL, note TEXT)`.
- `programme_progress(programme_id TEXT NOT NULL UNIQUE, active INTEGER DEFAULT 1, started_on TEXT, days_per_week INTEGER, next_position INTEGER DEFAULT 0, cycle_week INTEGER DEFAULT 1, lifts TEXT NOT NULL DEFAULT '{}' /*JSON map liftKey → LiftState*/)`.
- `meals` += `kind CHECK in meal|recipe DEFAULT 'meal'`, `servings INTEGER NOT NULL DEFAULT 1`, `prep_minutes INTEGER`, `cook_minutes INTEGER`, `steps TEXT NOT NULL DEFAULT '[]'`, `tags TEXT NOT NULL DEFAULT '[]'`, `fridge_days INTEGER`, `source CHECK in tally|user DEFAULT 'user'`, `key TEXT`, `description TEXT`; `meal_items` += `position INTEGER NOT NULL DEFAULT 0`.
- `food_logs` += `recipe_id TEXT`, `portions REAL`. `product_prices` += `source TEXT NOT NULL DEFAULT 'user'`.
- Indexes: `programme_days(programme_id, position)`, `programme_day_exercises(day_id, position)`, unique `meals(key) WHERE key IS NOT NULL`, `food_logs(recipe_id)`, `workouts(programme_day_id)`.

- [ ] **Step 1: Write the failing tests.** `migrations.test.ts`, test "migration 3 keeps existing rows and adds defaults": build a db with only `MIGRATIONS[0]` and `[1]` applied (as the existing migration-2 test does), insert one meal, one meal_item, one food_log, one product_price and one workout, call `migrate`, assert it returns `MIGRATIONS.length` (3) and that the meal reads back `kind 'meal'`, `servings 1`, `steps '[]'`, `source 'user'`, the price reads `source 'user'`, the new tables exist, and inserting a meal with `kind 'bogus'` rejects. `backup.test.ts`: "a version 2 backup (no programme tables) restores" builds a backup with `exportAll`, deletes the four programme tables from `tables` and sets `schemaVersion = 2`, and `importAll` resolves; "a version 3 backup round-trips programme rows"; "an unknown table is still rejected"; "deleteHealthData removes user recipes and their items but keeps Tally recipes, workouts and programmes" (insert one `meals` row `source 'tally'` and one `'user'`, each with an item). `food.test.ts`: "copyDay keeps recipe_id and portions".
- [ ] **Step 2:** Run `npx vitest run src/db src/domain/__tests__/backup src/domain/__tests__/food` — expected FAIL (no migration 3, backup rejects the old shape).
- [ ] **Step 3: Implement.** Append the migration (SQLite `ALTER TABLE … ADD COLUMN` for existing tables). In `backup.ts` add `UPGRADES[2]` that fills the four programme tables with `[]` when absent, so the "incomplete (no X)" check passes for a version 2 backup; extend `deleteHealthData` to hard-delete `meals` where `source = 'user'` and their `meal_items`. Update `FoodLog`, the log mappers and `insertLog` in `food.ts`; add `programmeDayId` to `getWorkout`.
- [ ] **Step 4:** Run the same command, then `npx vitest run` — expected PASS, whole suite green.
- [ ] **Step 5: Commit** `feat(db): migration 3 for programmes, recipes and recipe logs`.

### Task 2: Additive seeding, new ingredients and required exercises

**Files:**
- Modify: `src/domain/seed.ts`, `src/AppRoutes.tsx`, `src/components/RestoreFromBackup.tsx`, `scripts/build-seed.ts`, `scripts/seedConvert.ts`, `public/seed/starter.json`
- Test: `src/domain/__tests__/seed.test.ts`, `scripts/__tests__/seedConvert.test.ts`, `src/routes/__tests__/restore.test.tsx`

**Interfaces:**
- Consumes: the existing `seedIfEmpty`, `loadSeed`, `searchFoods`.
- Produces: `seedAll(db: SqlExecutor, data: SeedData): Promise<{ foods: number; exercises: number; programmes: number; recipes: number }>` replacing `seedIfEmpty` (update every caller and test); `SeedData = { starter: SeedFood[]; cofid: SeedFood[]; exercises: SeedExercise[]; programmes: unknown[]; recipes: unknown | null }` (Tasks 3 and 12 narrow the last two and add their seeders); `loadSeed` also fetches `/seed/programmes.json` and `/seed/recipes.json`, treating a 404 or an HTML reply as absent; `requiredExerciseNames(programmes: { days: { exercises: { exercise: string; alt?: string | null }[] }[] }[]): string[]` in `scripts/seedConvert.ts`.

Additive rules: a starter or CoFID food is inserted only if no row with the same `(source, name)` exists; an exercise only if no `source = 'seed'` row with the same name exists. Nothing is ever updated or deleted.

New starter foods, per 100 g (kcal, protein, carbs, fat) — append to `public/seed/starter.json`:

| Food | kcal | P | C | F |
| --- | --- | --- | --- | --- |
| Chicken thigh fillet, raw | 125 | 19.5 | 0 | 4.8 |
| Turkey mince, 5% fat, raw | 120 | 22 | 0 | 3.2 |
| Red lentils, dry | 340 | 24 | 56 | 1.3 |
| Chopped tomatoes, canned | 20 | 1 | 3.5 | 0.2 |
| Rice, dry | 355 | 7.5 | 79 | 0.6 |
| Rice, microwave pouch | 140 | 3 | 30 | 0.8 |
| Pasta, dry | 355 | 12.5 | 72 | 1.5 |
| Cottage cheese | 98 | 11.1 | 3.4 | 4.3 |
| Egg, raw | 143 | 12.5 | 0.7 | 9.5 |
| Ham, cooked | 107 | 17.5 | 1 | 3.5 |
| Spinach, frozen | 25 | 3 | 1 | 0.7 |
| Potato, baking, raw | 77 | 2 | 17 | 0.1 |
| Sweetcorn, canned | 80 | 2.6 | 14.5 | 1.2 |
| Frozen mixed berries | 45 | 0.9 | 9 | 0.3 |
| Peppers | 31 | 1 | 6 | 0.3 |
| Garlic | 149 | 6.4 | 33 | 0.5 |
| Mixed spices | 290 | 12 | 50 | 12 |
| Tikka curry paste | 160 | 2.5 | 9 | 12 |
| Soy sauce | 55 | 6.5 | 4.5 | 0.1 |
| Frozen mixed vegetables | 62 | 4.2 | 9 | 0.7 |

- [ ] **Step 1: Write the failing tests.** `seed.test.ts` (rename the `seedIfEmpty` calls to `seedAll`): "adds new starter foods for someone who already seeded" (seed the old three-food list, then seed a list with one extra: exactly one more row, none duplicated); "seeding twice adds nothing"; "never changes or removes existing rows" (rename an existing seeded food, reseed: the rename survives); "loadSeed treats a missing programmes.json as none" (fetch stub returns `{ ok: true, json: () => { throw SyntaxError } }` for it); "the 20 new foods are in starter.json with positive values and kcal within 25% of 4P+4C+9F"; "starter.json names are unique". `seedConvert.test.ts`: `requiredExerciseNames` returns each main and alt exercise name once, sorted. `restore.test.tsx`: "restoring a backup made before the new starter foods re-seeds them" (restore, then `Chicken thigh fillet, raw` exists; stub `fetch` for the seed files).
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/seed scripts src/routes/__tests__/restore` — expected FAIL.
- [ ] **Step 3: Implement** `seedAll` (one transaction; the foods and exercises parts now, programmes and recipes parts return 0 until their tasks). Call it from the `AppRoutes` Shell effect, and from `RestoreFromBackup` after a successful `importAll` (best effort, errors only logged). In `scripts/build-seed.ts` add `--programmes <path>`: read the programmes file, take `requiredExerciseNames`, add each of those exercises from the free-exercise-db JSON to the output if it isn't already among the 150 (exit 1 naming any name not found), keep the file sorted by name. Append the 20 foods.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(seed): additive seeding and recipe ingredients`.

### Task 3: Programme seed data and seeding

**Files:**
- Create: `public/seed/programmes.json`, `src/domain/programmes/types.ts`, `src/domain/programmes/seedProgrammes.ts`
- Modify: `src/domain/seed.ts`, `public/seed/exercises.json` (regenerate)
- Test: `src/domain/__tests__/programmesSeed.test.ts`

**Interfaces:**
- Consumes: `seedAll` (Task 2), `requiredExerciseNames` and `build-seed.ts --programmes`.
- Produces: `types.ts` exports `ProgressionKindName = 'double' | 'linear' | 'gzclp' | 'wendler531'`, `Tier = 'main' | 'bw' | 't1' | 't2' | 't3' | 'm531' | 'fsl' | 'assist'`, `Programme`, `ProgrammeDay`, `DayExercise` (camelCase mirrors of the columns), `LiftState = { weightKg: number; stage: number; stageStartKg: number; fails: number; trainingMaxKg?: number }`, `ProgrammeProgress`, `SeedProgramme`; `seedProgrammes(tx: SqlExecutor, list: SeedProgramme[]): Promise<number>` (count inserted); `seedAll` now returns real `programmes` counts.

`programmes.json` is an array of programmes shaped `{ key, name, author, level, progression, daysPerWeekOptions, description, days: [{ name, exercises: [{ exercise, alt?, tier, sets, reps: [min, max], lift?, amrap?, incrementKg?, note? }] }], cycle? }`. Exercise names are the free-exercise-db names below. `lift` defaults to `"<exercise>|<tier>"`. 5/3/1 lifts are `{ exercise, tier: 'm531', lift: "<exercise>" }` and the seeder expands them from the programme's `cycle` into one row per prescribed set (`week`, `percent`, `reps`, `is_amrap` on the last set of each week) plus an `fsl` row per week (5 × 5 at that week's first-set percent), with the same `lift_key`.

| Brief name | free-exercise-db name |
| --- | --- |
| Bench press | Barbell Bench Press - Medium Grip |
| Overhead press | Standing Military Press |
| Incline dumbbell press | Incline Dumbbell Press |
| Lateral raise | Side Lateral Raise |
| Triceps pushdown | Triceps Pushdown |
| Deadlift | Barbell Deadlift |
| Lat pulldown | Wide-Grip Lat Pulldown (alt: Pullups) |
| Seated cable row | Seated Cable Rows |
| Face pull | Face Pull |
| Dumbbell curl | Dumbbell Bicep Curl |
| Squat | Barbell Squat |
| Romanian deadlift | Romanian Deadlift |
| Leg press | Leg Press |
| Leg curl | Seated Leg Curl |
| Standing calf raise, Calf raise | Standing Calf Raises |
| Barbell row | Bent Over Barbell Row |
| Barbell curl | Barbell Curl |
| Skull crusher | EZ-Bar Skullcrusher |
| Dumbbell fly | Dumbbell Flyes |
| One-arm dumbbell row, Dumbbell row | One-Arm Dumbbell Row |
| Incline dumbbell curl | Incline Dumbbell Curl |
| Front squat | Front Squat (Clean Grip) |
| Walking lunge | Barbell Walking Lunge (note "each leg") |
| Leg extension | Leg Extensions |
| Seated calf raise | Seated Calf Raise |
| Chin-up | Chin-Up (tier `bw`, every set as many reps as possible, `reps: [1, 1]`) |
| 5/3/1 assistance defaults | Pushups (push), Chin-Up (pull), Barbell Walking Lunge (single-leg/core): tier `assist`, 5 sets, `reps: [10, 20]` |

Programme facts: keys `ppl` (levels beginner, `daysPerWeekOptions [3, 6]`, no author, kind `double`), `phul` (intermediate, `[4]`, author Brandon Campbell, `double`), `full-body-beginner` (beginner, `[3]`, no author, `linear`; every row has `incrementKg 2.5` except Deadlift `5`; Chin-Up tier `bw`), `gzclp` (intermediate, `[4]`, author Cody Lefever, `gzclp`), `531-beginners` (intermediate, `[3]`, author Jim Wendler, `wendler531`). Sets and rep ranges for every row are exactly the brief's. PHUL's two Leg curl rows use `lift` values `"Seated Leg Curl|power"` and `"Seated Leg Curl|hypertrophy"` so their weights are separate. GZCLP rows use tiers `t1`/`t2`/`t3` with stage-1 sets × reps (T1 5×3, T2 3×10, T3 3×15) and `amrap: true` on T1 and T3. Full-body A/B days are named "Workout A" and "Workout B"; the other day names are the brief's. 5/3/1's `cycle` is the brief's three weeks (65/75/85 × 5,5,5+; 70/80/90 × 3,3,3+; 75/85/95 × 5,3,1+; FSL percent 65, 70, 75).

- [ ] **Step 1: Write the failing tests** (`programmesSeed.test.ts`, using a helper `outline(db, key)` that returns each day's rows as `Name: Exercise sets×min–max`): one test per programme asserting the outline equals the brief (PPL 3 days of 5 rows; PHUL 4 days with 6/5/7/5 rows; full body A with 4 rows and B with 4; GZCLP 4 days of 3 rows; 5/3/1 Day 1 has Squat and Bench, Day 2 Deadlift and Overhead press, Day 3 Bench and Squat, each with 9 `m531` and 3 `fsl` rows plus 3 assistance rows); "5/3/1 week 2 percentages are 70, 80, 90 with reps 3, 3, 3 and the last set amrap"; "authors are Brandon Campbell, Cody Lefever and Jim Wendler and no other programme has one"; "each description is 1–280 characters, contains no URL, and the credited programmes name their author"; "every exercise referenced exists in the exercises table"; "seeding twice inserts nothing the second time and a renamed programme survives a reseed"; "increments: full body rows carry incrementKg 2.5 and the Deadlift 5, PPL rows carry none".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/programmesSeed` — expected FAIL (no data, no seeder).
- [ ] **Step 3: Implement.** Download free-exercise-db into a fresh directory (`curl -o "$TMP/dl/ex.json" https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`), write `programmes.json` in your own words, run `node scripts/build-seed.ts --exercises "$TMP/dl/ex.json" --programmes public/seed/programmes.json` to regenerate `exercises.json`, then implement `seedProgrammes` (resolve exercise ids by name from `exercises`, throw `Exercise not found: <name>` otherwise; skip programmes whose `key` exists) and call it from `seedAll`.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(train): seed five workout programmes`.

### Task 4: Rounding, starting a programme, the next workout and suggested weights

**Files:**
- Create: `src/domain/programmes/rounding.ts`, `catalog.ts`, `start.ts`, `plan.ts`, `kinds.ts`, `double.ts`, `linear.ts`
- Test: `src/domain/__tests__/programmePlan.test.ts`

**Interfaces:**
- Consumes: Task 3 rows; `getSettings` (for `weightUnit`); `weekStart`, `localDate`; `toKg`.
- Produces:
  - `rounding.ts`: `stepKg(unit: WeightUnit): number` (2.5, or 5 lb in kg); `roundKg(kg: number, unit): number` (nearest step); `incrementKg(row: { incrementKg: number | null }, lower: boolean, unit): number` (`row.incrementKg ?? (lower ? 2 : 1) × step`; for lb users an explicit `incrementKg` is converted to steps: 2.5 → 1 step, 5 → 2 steps); `isLowerBody(primaryMuscle: string | null): boolean`.
  - `catalog.ts`: `listProgrammes(db): Promise<ProgrammeSummary[]>` where `ProgrammeSummary = Programme & { days: { id: string; name: string; exercises: { name: string; sets: number; repMin: number; repMax: number; amrap: boolean }[] }[] }` (only `week` null or 1 rows shown for 5/3/1, collapsing `m531` rows into one entry "3 working sets" with sets 3); `getProgramme(db, key): Promise<ProgrammeSummary | null>`; `activeProgramme(db): Promise<{ programme: Programme; progress: ProgrammeProgress } | null>`.
  - `start.ts`: `type StartLift = { liftKey: string; exerciseId: string; name: string; lower: boolean; kind: 'weight' | 'trainingMax' }`; `programmeLifts(db, programmeId): Promise<StartLift[]>` (one per distinct `lift_key` that needs a weight; `bw` and `assist` rows excluded); `defaultStartKg(name: string, equipment: string | null): number` and `defaultTrainingMaxKg(name: string): number` per the planning-decisions table; `startProgramme(db, programmeId, o: { onDate: string; daysPerWeek?: number; startKg?: Record<string, number> }): Promise<string>` (liftKey → kg of weight or training max; missing keys fall back to the lift's previous state if one exists, then to the defaults; every weight goes through `roundKg`; deactivates other progress rows; resets position to 0 and cycle week to 1; `daysPerWeek` must be one of the programme's options, default the first).
  - `plan.ts`: `type PlannedSet = { reps: number; minReps: number; maxReps: number; weightKg: number; amrap: boolean }`; `type PlannedExercise = { dayExerciseId: string; exerciseId: string; altExerciseId: string | null; name: string; tier: Tier; liftKey: string; sets: PlannedSet[]; note: string | null }`; `type NextWorkout = { programmeId: string; programmeName: string; dayId: string; dayName: string; dayNumber: number; daysInRotation: number; plannedPerWeek: number; doneThisWeek: number; doneToday: boolean; cycleWeek: number | null; openWorkoutId: string | null }`; `nextWorkout(db, onDate: string): Promise<NextWorkout | null>`; `suggestWeights(db, programmeDayId: string): Promise<PlannedExercise[]>`; `startProgrammeWorkout(db, programmeDayId: string): Promise<string>` (inserts a `workouts` row with `programme_day_id`, or returns today's unfinished one for that day).
  - `types.ts` (defined here, used by Tasks 5–7): `ProgressionOutcome = { liftKey: string; exerciseId: string; name: string; result: 'progressed' | 'held' | 'incomplete' | 'not_done' | 'stage_change' | 'deload' | 'reset' | 'retest' | 'cycle_up'; fromKg: number; toKg: number; note?: string }`; `EvaluateArgs = { row: DayExercise; state: LiftState; sets: { reps: number; weightKg: number }[] /* the first N working sets, possibly fewer */; prescribed: number; unit: WeightUnit; lower: boolean; decision: 'miss' | 'ignore' }`; `LiftUpdate = { state: LiftState; result: ProgressionOutcome['result']; note?: string }`.
  - `kinds.ts`: `interface ProgressionKind { prescribe(row: DayExercise, state: LiftState | undefined, ctx: { unit: WeightUnit; lower: boolean; cycleWeek: number }): PlannedSet[]; evaluate(args: EvaluateArgs): LiftUpdate; endOfWorkout?(args: { progress: ProgrammeProgress; finishedPosition: number; days: number; unit: WeightUnit; lowerByLift: Record<string, boolean>; names: Record<string, { exerciseId: string; name: string }> }): { progress: ProgrammeProgress; outcomes: ProgressionOutcome[] } }` and `export const KINDS: Record<ProgressionKindName, ProgressionKind>`; this task registers `double` and `linear`, whose `prescribe` returns `sets` sets at the lift's weight with reps `repMin` (min/max from the row); their `evaluate` is added in Task 5 (a stub that throws `Not implemented` here).

- [ ] **Step 1: Write the failing tests** (`programmePlan.test.ts`, seeding programmes with `seedAll` from the real JSON): `roundKg(61, 'kg') === 60`, `roundKg(61.3, 'kg') === 62.5`, `roundKg(toKg(137, 'lb'), 'lb')` equals `toKg(135, 'lb')`; `incrementKg` for kg upper 2.5, lower 5, explicit 2.5, explicit 5, and for lb upper = `toKg(5,'lb')`, lower = `toKg(10,'lb')`; `defaultStartKg('Barbell Squat', 'barbell') === 20`, `('Side Lateral Raise', 'dumbbell') === 3`, `('Chin-Up', 'body only') === 0`; "programmeLifts for PPL lists 15 lifts and for 5/3/1 lists four trainingMax lifts"; "startProgramme stores the given weight, defaults the rest, and a second programme deactivates the first but keeps its state"; "starting with daysPerWeek 4 on PPL throws"; "starting PPL again keeps a lift's previous weight when none is given"; "nextWorkout is null with no active programme, then Push 1 of 3 with plannedPerWeek 3 (or 6 when chosen), doneThisWeek 0, doneToday false, openWorkoutId null"; "suggestWeights for PPL Push with bench at 60: bench has 4 sets of reps 6 (min 6, max 8) at 60 kg, overhead press 3 sets at 20, none amrap"; "suggestWeights before the programme is started uses the defaults"; "startProgrammeWorkout twice for the same day returns the same open workout and links `programme_day_id`".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/programmePlan` — expected FAIL.
- [ ] **Step 3: Implement** the signatures above. `nextWorkout` counts finished programme workouts (`ended_at` set, `programme_day_id` non-null) between `weekStart(onDate)` and the following Sunday for `doneThisWeek`, and finished ones on `onDate` for `doneToday`; `cycleWeek` is the progress `cycle_week` for `wendler531`, else null.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(train): start a programme, next workout and suggested weights`.

### Task 5: Progression engine, double progression and linear progression

**Files:**
- Create: `src/domain/programmes/progression.ts`
- Modify: `src/domain/programmes/double.ts`, `linear.ts`, `kinds.ts`, `types.ts`
- Test: `src/domain/__tests__/progressionDouble.test.ts`, `progressionLinear.test.ts`

**Interfaces:**
- Consumes: Task 4's `KINDS`, `EvaluateArgs`, `LiftUpdate`, `ProgressionOutcome`, `startProgramme`, `suggestWeights`, `nextWorkout`, rounding; `finishWorkout`, `logSet` from `training.ts`.
- Produces: `applyProgression(db, workoutId: string, decisions?: Record<string, 'miss' | 'ignore'>): Promise<ProgressionOutcome[]>` (decisions keyed by `liftKey`, default `'ignore'`); `progressionShortfalls(db, workoutId: string): Promise<{ liftKey: string; exerciseId: string; name: string; logged: number; prescribed: number }[]>`.

`applyProgression` rules (shared): do nothing and return `[]` if the workout has no `programme_day_id`, isn't finished, or already has `progression_applied_at`. For each day row whose tier isn't `bw`/`assist`: gather the first N non-warm-up sets by `set_number` for `row.exercise_id`; zero sets → `not_done`; call the kind's `evaluate`; write the new `LiftState` into `programme_progress.lifts[lift_key]`; then call the kind's optional `endOfWorkout` (used by 5/3/1), set `next_position = (finishedDay.position + 1) % days` and stamp `progression_applied_at`. Everything runs in one transaction. `progressionShortfalls` returns lifts of kinds with failure semantics (linear, GZCLP T1 and T2) that have 1..N−1 logged sets where every logged set met its reps.

Double: success = N sets logged and every set's reps ≥ `repMax`; new weight = lightest set weight + `incrementKg(row, lower, unit)`; result `progressed`. Fewer than N sets → `incomplete`. Otherwise `held`.
Linear: success = N sets and every set's reps ≥ `repMax`; new weight = lightest set weight + increment, `fails = 0`. A logged set under target reps, or a shortfall with decision `'miss'`, is a miss: `fails + 1`; at 3 fails the weight becomes `roundKg(0.9 × weight)`, `fails = 0`, result `deload`. A shortfall with the default decision is `incomplete` (nothing changes).

- [ ] **Step 1: Write the failing tests.** `progressionDouble.test.ts` (PPL, kg, start weights bench 60, squat 100, deadlift 100): "all four bench sets of 8 at 60 progresses to 62.5"; "squat 4×8 at 100 → 105 and deadlift 3×5 at 100 → 105 (lower body)"; "bench reps 8,8,8,7 holds at 60"; "three of four sets logged is incomplete and unchanged"; "no sets for a lift is not_done"; "extra sets are ignored (8,8,8,8,3 progresses)"; "warm-ups don't count (a 3-rep warm-up at 40 plus 4×8 at 60 progresses)"; "lifting 55 instead of 60 and hitting 8s gives 57.5"; "applying twice changes nothing the second time and returns []"; "an unfinished workout returns [] and changes nothing"; "a routine workout (no programme day) returns []"; "swapping the exercise leaves the lift untouched (not_done)"; "lb user: bench 135 lb with 4×8 gives 140 lb and squat 225 lb gives 235 lb, and no false miss from rounding"; "finishing Push moves nextWorkout to Pull, finishing Legs wraps to Push, doneToday is true after a finish today, and doneThisWeek counts Monday–Sunday only (a Sunday and the next Monday fall in different weeks)". `progressionLinear.test.ts` (full body, squat 60, bench 40, row 40, OHP 30, deadlift 80): "squat 3×5 at 60 → 62.5, deadlift 1×5 at 80 → 85, chin-ups never change weight"; "a 4-rep set is a miss: fails 1 and weight unchanged; three misses in three workouts deload 60 to 55 and reset fails"; "a success resets the fail count"; "a shortfall with the default decision is incomplete and not counted; with decision 'miss' it counts"; "progressionShortfalls lists a lift with 2 of 3 sets logged, hits reps, and omits double-progression lifts and lifts with a short rep".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/progressionDouble src/domain/__tests__/progressionLinear` — expected FAIL.
- [ ] **Step 3: Implement** `applyProgression`, `progressionShortfalls` and the `evaluate` of `double` and `linear` per the rules above.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(train): double and linear progression`.

### Task 6: GZCLP

**Files:**
- Create: `src/domain/programmes/gzclp.ts`
- Modify: `src/domain/programmes/kinds.ts`
- Test: `src/domain/__tests__/progressionGzclp.test.ts`

**Interfaces:**
- Consumes: Task 5's `applyProgression`, `EvaluateArgs`, `LiftUpdate`; Task 4's `KINDS`, rounding.
- Produces: `KINDS.gzclp` (`prescribe` and `evaluate`). Stage tables: T1 `[{sets:5,reps:3},{sets:6,reps:2},{sets:10,reps:1}]` with the last set amrap and its minimum equal to the stage reps; T2 `[{sets:3,reps:10},{sets:3,reps:8},{sets:3,reps:6}]`, no amrap; T3 `{sets:3,reps:15}` last set amrap. `LiftState.stage` is 1-based; `stageStartKg` is the weight where the lift last entered stage 1.

Rules: T1/T2 success (N = the stage's sets, every set ≥ the stage's reps) adds `incrementKg` (from the lightest set weight) and stays on the stage. A miss (rep shortfall, or shortfall with decision `'miss'`) moves to the next stage at the same weight; a T1 miss at stage 3 is `retest`: stage 1 at `roundKg(0.85 × weight)`, `stageStartKg` = that weight; a T2 miss at stage 3 is `reset`: stage 1 at `stageStartKg + 2 × stepKg(unit)`, `stageStartKg` = that weight. A shortfall with the default decision is `incomplete`. T3: when 3 sets are logged and the last set has ≥ 25 reps, add the increment (`progressed`); otherwise `held`; fewer than 3 sets is `incomplete`.

- [ ] **Step 1: Write the failing tests** (GZCLP seeded; starts: squat 100, bench 60, lat pulldown 40, OHP 40, deadlift 100, dumbbell row 20): "suggestWeights Day 1: squat 5 sets of 3 at 100 with only the last amrap, bench 3 sets of 10 at 60, pulldown 3 sets of 15 at 40 with the last amrap"; "T1 squat 3,3,3,3,5 → 105 on stage 1"; "T1 miss (3,3,3,3,2) → stage 2 at 100; suggestWeights then shows 6 sets of 2"; "second miss → stage 3, 10 sets of 1"; "a miss at stage 3 is retest: stage 1 at 85 (100 × 0.85 = 85)"; "T2 bench 10,10,10 → 62.5"; "T2 miss → 3×8, → 3×6, then reset to stageStartKg + 5 (60 → 65) on stage 1"; "T3 last set 25 → +2.5 on pulldown, 24 holds, and a 5-set-short log is incomplete"; "Bench keeps separate states for T2 (Day 1) and T1 (Day 3)"; "finishing Day 4 wraps to Day 1"; "shortfall: 4 of 5 T1 sets at reps is listed by progressionShortfalls; decision 'miss' moves to stage 2, default holds"; "lb user retest rounds to 5 lb".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/progressionGzclp` — expected FAIL.
- [ ] **Step 3: Implement** `KINDS.gzclp`.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(train): GZCLP stages and progression`.

### Task 7: 5/3/1 for Beginners

**Files:**
- Create: `src/domain/programmes/wendler.ts`
- Modify: `src/domain/programmes/kinds.ts`, `src/domain/programmes/start.ts`
- Test: `src/domain/__tests__/progression531.test.ts`

**Interfaces:**
- Consumes: Task 3's expanded 5/3/1 rows (`week`, `percent`, `is_amrap`), Task 4's `prescribe` context (`cycleWeek`, `unit`), `personalRecords` from `training.ts`.
- Produces: `KINDS.wendler531`; `estimateTrainingMax(db, exerciseId: string): Promise<number | null>` in `start.ts` (`roundKg(0.9 × best estimated 1RM, unit)` from logged working sets, null if none; `startProgramme` uses it before the default for `trainingMax` lifts).

Rules: `prescribe` returns the rows for the current `cycleWeek` (and `week` null rows): each `m531` row one set at `roundKg(trainingMaxKg × percent / 100, unit)` with reps and amrap from the row; `fsl` rows 5 sets of 5 at the same rounding of the week's first-set percent; `assist` rows sets × `repMin` at the last logged weight or 0. `evaluate` never changes weights per session (it returns `held`, or `not_done` handled by the engine). The cycle rolls over in this kind's `endOfWorkout` hook: after the last day of the rotation is finished (`finishedPosition === days - 1`), `cycle_week + 1`; after week 3, `cycle_week = 1` and every `trainingMaxKg` rises once by `incrementKg({ incrementKg: null }, lower, unit)` (lower +2 steps, upper +1), reported as `cycle_up` outcomes.

- [ ] **Step 1: Write the failing tests** (5/3/1 seeded): "TM 100: week 1 working sets 65/75/85 kg × 5,5,5+ (last amrap), FSL 5×5 at 65"; "week 2: 70/80/90 × 3,3,3+, FSL 70"; "week 3: 75/85/95 × 5,3,1+, FSL 75"; "TM 87.5 rounds to 57.5, 65, 75 (56.875, 65.625, 74.375)"; "lb user TM 225 lb gives 145, 170, 190 lb"; "Day 1 is Squat then Bench, Day 2 Deadlift then Overhead press, Day 3 Bench then Squat, each followed by their FSL, then three assistance rows"; "finishing days 1–3 of week 1 moves to week 2; after week 3's Day 3 the week is 1 and squat and deadlift maxes rise 5, bench and overhead press 2.5, each exactly once although Bench and Squat appear twice"; "applying the Day 3 progression twice doesn't raise twice"; "estimateTrainingMax: null with no logged sets; with a logged 100 × 5 (est 116.7) returns 105 (0.9 × 116.7 = 105.0 → 105)"; "starting with no maxes uses the estimate where there is one and 40/40/40/30 otherwise"; "AMRAP sets with few reps don't change anything".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/progression531` — expected FAIL.
- [ ] **Step 3: Implement** `KINDS.wendler531`, the cycle rollover and `estimateTrainingMax`.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(train): 5/3/1 cycle, percentages and training maxes`.

### Task 8: Choose a programme, start it, and the Next workout card

**Files:**
- Create: `src/routes/train/Programmes.tsx`, `src/routes/train/ProgrammeDetail.tsx`, `src/components/train/NextWorkoutCard.tsx`
- Modify: `src/routes/Train.tsx`
- Test: `src/routes/__tests__/programmes.test.tsx`

**Interfaces:**
- Consumes: `listProgrammes`, `getProgramme`, `activeProgramme`, `programmeLifts`, `startProgramme`, `nextWorkout`, `startProgrammeWorkout`, `defaultStartKg`, `defaultTrainingMaxKg`, `fromKg`/`toKg`, `useFormatDate`.
- Produces: routes `/train/programmes` (chooser: one list row per programme with name, author credit if any, "<n> days a week · <level>", a two-line description, and a link into the detail) and `/train/programmes/:key` (days with their exercises as `Name sets×min–max`, "Days a week" choice when the programme has several, one weight field per lift in the user's unit prefilled with the defaults — "Training max" for 5/3/1 with a note "90% of your one-rep max" — an "I don't know, start light" button that fills the defaults, and a "Start this programme" button); `NextWorkoutCard` (props `{ onStart: (dayId) => void }`): "Next: Pull day", "Day 2 of 3 · 1 of 3 done this week" (plus "Week 2 of 3" for 5/3/1), a "Start Pull day" button (or "Continue Pull day" when `openWorkoutId`), "Done today" text when `doneToday`; Train home shows the card first when a programme is active, otherwise a "Choose a programme" row, and keeps the routines list.

- [ ] **Step 1: Write the failing tests:** "the chooser lists five programmes with days a week and level, credits Brandon Campbell, Cody Lefever and Jim Wendler, and shows no URLs"; "a programme page previews every day"; "I don't know fills the starting weights with the empty-bar defaults, and Start creates the progress and goes to Train"; "5/3/1 asks for training maxes and shows the 90% note"; "PPL offers 3 or 6 days a week and the choice is saved"; "lb users see and enter pounds"; "with an active programme, Train shows 'Next: Push day' and Start Push day creates a workout and opens it"; "after finishing it the card says Next: Pull day"; "with none, Train offers Choose a programme"; "a validation message appears for a non-numeric weight and Start stays disabled".
- [ ] **Step 2:** Run `npx vitest run src/routes/__tests__/programmes` — expected FAIL.
- [ ] **Step 3: Implement** the screens as list rows (no cards), sentence case, tokens, ≥ 44 px targets.
- [ ] **Step 4:** Run `npx vitest run` — PASS. Screenshot `/train/programmes`, a programme page and Train with the card at 375 px, light and dark, and look for crowding and overflow.
- [ ] **Step 5: Commit** `feat(train): programme chooser, start screen and next workout card`.

### Task 9: Programme workouts on the workout screen

**Files:**
- Create: `src/components/train/ShortfallSheet.tsx`
- Modify: `src/routes/train/Workout.tsx`
- Test: `src/routes/__tests__/programmeWorkout.test.tsx`

**Interfaces:**
- Consumes: `suggestWeights`, `getWorkout().programmeDayId`, `applyProgression`, `progressionShortfalls`, `finishWorkout`, `logSet`, existing stepper/rest-timer UI.
- Produces: for a workout with `programmeDayId` the screen builds its blocks from `suggestWeights` (weights and prefilled reps from the plan, a "6–8" or "5+" label per set, a note under the exercise name); every block gets a "Swap exercise" button (a sheet with the alternative first, then search; only before a set is logged for that block; the replacement starts at its last logged weight or 0) and every unlogged set a "Skip set" button; "Add set" still works. "Finish workout": in one transaction `finishWorkout` then `progressionShortfalls`; if any, show `ShortfallSheet` ("You did 3 of 5 sets of Squat. Count this as a missed session? / Count as a miss / Don't count"), then `applyProgression(db, id, decisions)` and a toast naming the first two outcomes in neutral words ("Squat: 105 kg next time", "Bench: same weight next time", "Squat: new weight 85 kg after a retest").

- [ ] **Step 1: Write the failing tests:** "a programme workout opens with the suggested weights and minimum reps, and one tap logs a set as shown (reps 6 at 60 kg) and starts the rest timer"; "AMRAP sets show '3+' and prefill 3"; "swap exercise replaces the block and the old lift is not_done at the end"; "skip set removes it and progression sees a shortfall"; "extra sets can be added"; "finishing a clean double-progression workout shows 'Bench: 62.5 kg next time' and Train's card moves to the next day"; "finishing with a GZCLP T1 shortfall opens the sheet, Don't count leaves the stage, Count as a miss moves it"; "finishing a routine workout behaves as before (no sheet, no progression)"; "pressing Finish twice doesn't apply progression twice".
- [ ] **Step 2:** Run `npx vitest run src/routes/__tests__/programmeWorkout src/routes/__tests__/workout` — expected FAIL for the new tests, existing workout tests PASS.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run` — PASS. Screenshot the "Next workout" card on Train and a programme workout screen at 375 px, light and dark.
- [ ] **Step 5: Commit** `feat(train): programme workouts with suggested weights and progression`.

### Task 10: Copy and edit a programme as your own routines

**Files:**
- Modify: `src/domain/programmes/catalog.ts`, `src/domain/training.ts`, `src/routes/train/Routine.tsx`, `src/routes/Train.tsx`, `src/routes/train/ProgrammeDetail.tsx`
- Test: `src/domain/__tests__/programmeCopy.test.ts`, `src/routes/__tests__/routineEdit.test.tsx`

**Interfaces:**
- Produces: `copyProgrammeToRoutines(db, programmeId: string): Promise<string[]>` (one routine per day named "<Programme> – <Day>", `routine_exercises` with `target_sets = sets` and `target_reps = repMin`; for 5/3/1 each lift is one row of 3 sets × 5 reps; assistance rows included; the programme and its progress are untouched); `getRoutine(db, id): Promise<{ id; name; items: { exerciseId; name; targetSets; targetReps }[] } | null>`; `updateRoutine(db, id, name, items)` (replaces the items); `deleteRoutine(db, id)` (soft). `/train/routine/:id` edits (same form as new, titled "Edit routine", with "Delete routine" and an Undo toast); the programme page gets a "Copy and edit" button that makes the routines and opens the first one for editing.

- [ ] **Step 1: Write the failing tests:** "copying PPL makes 3 routines with the right rows and doesn't touch programme state"; "copying twice makes a second set (no overwrite)"; "5/3/1 copy has Squat 3×5"; "updateRoutine replaces items and keeps the id"; "deleteRoutine hides it from listRoutines"; screen tests "Copy and edit opens the first routine with its exercises", "editing sets and reps and saving updates the routine", "Delete routine offers Undo".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/programmeCopy src/routes/__tests__/routineEdit` — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(train): copy a programme to your own routines and edit routines`.

### Task 11: Recipe domain

**Files:**
- Create: `src/domain/recipes/types.ts`, `recipes.ts`, `prices.ts`, `shopping.ts`
- Modify: `src/domain/food.ts` (`dayLogsNamed` names recipe logs)
- Test: `src/domain/__tests__/recipes.test.ts`, `recipePrices.test.ts`, `shopping.test.ts`

**Interfaces:**
- Consumes: Task 1 columns; `getFood`, `insertLog` patterns from `food.ts`; `newId`, `nowIso`, `localDate`.
- Produces:
  - `types.ts`: `RecipeCost = { perPortionPence: number; totalPence: number; complete: boolean; missing: string[]; estimatedMonth: string | null }`; `RecipeTag = 'batch' | 'quick' | 'breakfast' | 'lunch' | 'dinner' | 'freezer-friendly'`; `Recipe = { id; key: string | null; name; description: string | null; servings: number; prepMinutes: number | null; cookMinutes: number | null; steps: string[]; tags: RecipeTag[]; fridgeDays: number | null; source: 'tally' | 'user'; items: { foodId: string; name: string; grams: number }[] }`; `NewRecipe = Omit<Recipe, 'id' | 'key' | 'source' | 'items'> & { items: { foodId: string; grams: number }[] }`.
  - `recipes.ts`: `createRecipe(db, r: NewRecipe): Promise<string>` (source `user`, kind `recipe`; rejects servings < 1, no ingredients, a blank name or grams ≤ 0); `getRecipe(db, id): Promise<Recipe | null>` (items in position order, deleted foods still listed by their stored name); `updateRecipe(db, id, r: NewRecipe)` (user recipes only); `deleteRecipe(db, id)` (soft, user recipes only); `copyRecipe(db, id): Promise<string>` (user copy named `"<name> (mine)"`, same items, steps and tags); `recipeNutrition(db, recipeId): Promise<{ kcal: number; proteinG: number; carbsG: number; fatG: number }>` per portion (kcal rounded, grams to 1 dp; ingredients whose food row is missing contribute nothing); `logRecipe(db, recipeId, portions: number, slot: Slot, logDate?: string): Promise<string>` (portions ≥ 0.5; one `food_logs` row, `recipe_id` and `portions` set, `food_id` and `grams` null, snapshot = per-portion × portions); `listRecipes(db, f?: { tag?: RecipeTag; source?: 'tally' | 'user' }): Promise<RecipeSummary[]>` with `RecipeSummary = Recipe & { nutrition: { kcal: number; proteinG: number; carbsG: number; fatG: number }; cost: RecipeCost; proteinPerPound: number | null }` (`proteinPerPound` = protein per portion ÷ (perPortionPence ÷ 100), null when cost is 0 or incomplete); `dayLogsNamed` shows a recipe log as `"<recipe name>, <portions> portion(s)"`.
  - `prices.ts`: `latestPrice(db, foodId): Promise<{ pricePence: number; packG: number; source: 'estimate' | 'user'; logDate: string } | null>` (latest `log_date`, then rowid); `setIngredientPrice(db, foodId, pricePence: number, packG: number): Promise<void>` (inserts a `source 'user'` row; rejects non-positive values).
  - `recipes.ts` also exports `recipeCost(db, recipeId): Promise<RecipeCost>` (ingredient cost = grams ÷ packG × pricePence using `latestPrice`; totals rounded to whole pence; `missing` = names without a price; `estimatedMonth` like "October 2026" when any price used is an estimate).
  - `shopping.ts`: `weekShoppingList(db, selections: { recipeId: string; portions: number }[]): Promise<{ lines: { foodId: string; name: string; grams: number; costPence: number | null }[]; totalPence: number; complete: boolean }>` (grams scaled by portions ÷ servings, the same food merged across recipes, lines sorted by name, grams rounded to whole grams).

- [ ] **Step 1: Write the failing tests:** `recipes.test.ts` (fixture foods inserted directly; a 4-serving recipe of 400 g chicken at 100 kcal/20 g protein per 100 g plus 200 g rice at 350 kcal/7 g): "nutrition per portion divides by servings (kcal 200, protein 23.5)"; "logging 2 portions doubles the snapshot and sets recipe_id, portions 2 and food_id null"; "logging 0.5 works, 0.25 is refused"; "editing a food's values or a recipe afterwards leaves past logs unchanged"; "a deleted ingredient food doesn't crash and contributes nothing"; "servings 0 and empty ingredient lists are refused"; "copyRecipe makes a user copy with the same items and the original is untouched"; "updateRecipe and deleteRecipe refuse a Tally recipe"; "listRecipes filters by tag and source". `recipePrices.test.ts`: "cost = grams ÷ pack × price per portion and in total"; "editing a price changes cost but not past logs or nutrition"; "the latest price wins and the older row is kept"; "a food without a price makes cost incomplete and names it"; "estimatedMonth reads 'October 2026' for an estimate row and is null once the user has edited every price used". `shopping.test.ts`: "the same ingredient in two recipes merges into one line"; "portions scale quantities (2 portions of a 4-serving recipe = half the grams)"; "total is the sum of the line costs and incomplete when a food has no price"; "lines sort by name".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/recipes src/domain/__tests__/recipePrices src/domain/__tests__/shopping` — expected FAIL.
- [ ] **Step 3: Implement.** Nutrition per 100 g comes from the live `foods` row; never store computed nutrition on a recipe.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(food): recipe nutrition, cost, logging and shopping lists`.

### Task 12: The 12 recipes, estimated prices and seeding

**Files:**
- Create: `public/seed/recipes.json`, `src/domain/recipes/seedRecipes.ts`
- Modify: `src/domain/seed.ts`
- Test: `src/domain/__tests__/recipesSeed.test.ts`

**Interfaces:**
- Consumes: Task 2's foods, Task 11's `recipeNutrition`, `recipeCost`, `getRecipe`, `listRecipes`.
- Produces: `seedRecipes(tx, file: { pricesEstimated: string; prices: { food: string; packG: number; pricePence: number }[]; recipes: SeedRecipe[] }): Promise<number>`; `seedAll` returns real `recipes` counts. `recipes.json` is `{ "pricesEstimated": "October 2026", "prices": [...], "recipes": [{ key, name, description, servings, prepMinutes, cookMinutes, fridgeDays, tags, ingredients: [{ food, grams }], steps }] }`. Seeding: insert missing `key`s as `meals` rows (`kind 'recipe'`, `source 'tally'`) with items in order; insert a `product_prices` row (`source 'estimate'`, `shop` "Estimated", `log_date` the first day of the stated month) for each priced food that has no price yet. Existing recipes and prices are never touched.

Prices (`pack_g` edible grams, estimated pence): Chicken thigh fillet, raw 1000/650 · Chicken breast, raw 1000/600 · Turkey mince, 5% fat, raw 500/275 · Beef mince, 5% fat, raw 500/360 · Red lentils, dry 500/130 · Kidney beans, canned 240/65 · Chopped tomatoes, canned 400/45 · Rice, dry 1000/160 · Rice, microwave pouch 250/95 · Pasta, dry 500/70 · Tuna, canned in brine 112/100 · Greek yoghurt, 0% fat 500/170 · Whey protein powder 1000/1500 · Cottage cheese 300/110 · Egg, raw 660/240 · Ham, cooked 100/85 · Spinach, frozen 800/150 · Potato, baking, raw 1000/120 · Sweetcorn, canned 285/55 · Baked beans 400/50 · Bread, wholemeal 800/90 · Frozen mixed berries 500/190 · Oats, rolled 1000/125 · Milk, semi-skimmed 1000/65 · Peppers 500/150 · Onion 1000/110 · Carrot 1000/80 · Garlic 50/40 · Olive oil 920/550 · Mixed spices 45/125 · Tikka curry paste 290/150 · Soy sauce 150/100 · Frozen mixed vegetables 1000/120 · Cheddar cheese 400/340 · Butter 250/200. Existing starter names are used exactly as they appear in `starter.json` (for example the oats food is "Oats, rolled" and the beef mince "Beef mince, 5% fat, raw").

Recipes (portions · ingredients in grams · prep/cook minutes · fridge days · tags). Descriptions and steps are written fresh, short and numbered.

| Recipe | Portions | Ingredients (g) | Prep/cook | Fridge | Tags |
| --- | --- | --- | --- | --- | --- |
| Chicken thigh, rice and pepper traybake | 4 | thigh 700, rice dry 280, peppers 400, onion 200, olive oil 20, spices 8, garlic 10 | 15/40 | 3 | batch, dinner |
| Turkey mince chilli with kidney beans | 4 | turkey mince 500, kidney beans 480, chopped tomatoes 800, onion 200, peppers 150, rice dry 280, spices 10, garlic 10, olive oil 10 | 15/35 | 4 | batch, dinner, freezer-friendly |
| Beef and lentil bolognese | 5 | beef mince 400, red lentils 150, chopped tomatoes 800, onion 200, carrot 200, pasta dry 375, garlic 10, spices 4, olive oil 10 | 15/40 | 4 | batch, dinner, freezer-friendly |
| Chicken tikka-style curry with Greek yoghurt and rice | 4 | chicken breast 600, Greek yoghurt 200, tikka paste 100, chopped tomatoes 400, onion 200, rice dry 280, garlic 10, olive oil 10 | 15/30 | 3 | batch, dinner, freezer-friendly |
| Tuna pasta bake | 4 | tuna 448, pasta dry 300, chopped tomatoes 400, sweetcorn 150, cheddar 80, onion 100, garlic 5, spices 4 | 15/30 | 3 | batch, lunch, dinner, freezer-friendly |
| Turkey meatballs in tomato sauce | 4 | turkey mince 600, egg 55, bread 36, chopped tomatoes 800, onion 150, pasta dry 300, garlic 10, spices 6, olive oil 10 | 20/30 | 4 | batch, dinner, freezer-friendly |
| Egg, ham and spinach muffins (12 muffins, 3 a portion) | 4 | egg 660, ham 120, spinach frozen 150, cheddar 60, cottage cheese 150, olive oil 5 | 10/25 | 4 | batch, breakfast, lunch, freezer-friendly |
| Overnight oats with Greek yoghurt and whey (5 jars) | 5 | oats 250, Greek yoghurt 750, whey 100, milk 400, frozen berries 250 | 10/0 | 4 | batch, breakfast |
| Tuna, sweetcorn and cottage cheese jacket potato | 1 | potato 300, tuna 112, cottage cheese 100, sweetcorn 50 | 5/10 | 1 | quick, lunch |
| Chicken and veg egg-fried rice | 1 | chicken breast 130, egg 55, microwave rice 125, frozen mixed veg 80, soy sauce 10, olive oil 5 | 10/8 | 1 | quick, lunch, dinner |
| Scrambled eggs and beans on toast | 1 | egg 165, baked beans 200, bread 72, butter 5, milk 20 | 5/8 | none | quick, breakfast, lunch |
| Greek yoghurt protein pot | 1 | Greek yoghurt 200, whey 25, frozen berries 80, oats 20 | 5/0 | 2 | quick, breakfast |

Expected (to guide wording, verified by the tests): protein per portion 35.0–47.7 g, cost £0.98–£1.82, for example the traybake 41.4 g at £1.71 and the jacket potato 47.5 g at £1.82.

- [ ] **Step 1: Write the failing tests** (`recipesSeed.test.ts`, seeding foods, recipes and prices with the real files): "there are exactly 12 Tally recipes with the brief's names"; "every recipe computes at least 30 g protein per portion"; "every recipe costs at most 200 pence a portion, and cost is complete"; "batch recipes make 3–5 portions; quick recipes have prepMinutes ≤ 15 and 1 portion"; "every recipe has at least 3 numbered steps, ingredients in positive grams, prep and cook times, tags from the allowed set, and a fridge-days value (null only for the scrambled eggs)"; "every ingredient food exists"; "no text contains clean, guilt-free, cheat, junk, sinful or naughty (case-insensitive, whole words) or a URL"; "recipe nutrition is computed, not stored: changing a food's protein changes the recipe's"; "seeding twice adds no recipes or prices; an edited price survives a reseed; an existing user's own recipes are untouched"; "estimatedMonth reads October 2026"; "a backup restored from before this release, then re-seeded, has the 12 recipes".
- [ ] **Step 2:** Run `npx vitest run src/domain/__tests__/recipesSeed` — expected FAIL.
- [ ] **Step 3: Implement.** Write every description and step in your own words. If a recipe misses 30 g protein or £2.00 with these numbers, adjust its grams in `recipes.json` and keep the table above in sync; if it can't be made to fit, stop and tell the product owner.
- [ ] **Step 4:** Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(food): seed 12 high-protein recipes with estimated prices`.

### Task 13: Recipe screens

**Files:**
- Create: `src/routes/food/Recipes.tsx`, `src/routes/food/RecipeDetail.tsx`, `src/routes/food/RecipeEdit.tsx`
- Modify: `src/routes/Food.tsx`
- Test: `src/routes/__tests__/recipes.test.tsx`

**Interfaces:**
- Consumes: Task 11's domain, `recentFoods`, `searchFoods`, `deleteLog`, `slotFor`, settings (`hideCalories`).
- Produces: routes `/food/recipes` (filter chips All · Batch · Quick · Breakfast · Lunch · Dinner · Mine; sort Cost · Protein · Time; rows show name, "<g> g protein · £<cost> a portion · <time> min", a kcal figure only when calories aren't hidden, and a "Prices estimated October 2026" line once under the list), `/food/recipes/:id` (ingredients in grams, numbered steps, prep/cook/fridge, nutrition and cost per portion, "£ per portion" and "protein per £", **Log a portion** with a 0.5-step portions control, **Copy and edit**, **Save as my recipe** (Tally recipes) or **Edit** / **Delete** (own recipes, delete with Undo), and **Edit prices** opening a sheet with one row per ingredient: price and pack size, saved through `setIngredientPrice`), `/food/recipes/new` and `/food/recipes/:id/edit` (name, portions, prep/cook minutes, tags as chips, steps one per line, ingredients picked from recently logged foods first and then search, with grams). The Food screen links to Recipes and to "Plan my week" (Task 14). One-tap logging picks the slot from the recipe's single meal tag if it has exactly one of breakfast/lunch/dinner, otherwise from the time of day; the toast says "Logged <name>" with Undo. Food day rows for recipe logs read "<name>, 2 portions".

- [ ] **Step 1: Write the failing tests:** "the list shows 12 recipes and filters by Quick (4) and Breakfast"; "sorting by cost puts the cheapest first, by protein the highest first, by time the quickest first"; "hide calorie numbers removes every kcal figure from the list and the detail page"; "Log a portion writes a recipe log with the snapshot and an Undo removes it"; "logging 2 portions doubles it"; "Copy and edit makes my copy and opens its edit screen; Save as my recipe makes it appear under Mine"; "editing a price changes the cost shown but not the logged snapshot"; "a recipe whose ingredient has no price says cost is incomplete and names it"; "creating a recipe from recently logged foods: pick two, set grams and 2 portions, save, and its nutrition per portion appears"; "creating needs a name, at least one ingredient and portions ≥ 1, with a message that says what to fix"; "own recipes can be deleted with Undo, Tally recipes can't"; "no text on these screens contains the banned words".
- [ ] **Step 2:** Run `npx vitest run src/routes/__tests__/recipes` — expected FAIL.
- [ ] **Step 3: Implement** with list rows, tokens, sentence case, ≥ 44 px targets and labelled controls.
- [ ] **Step 4:** Run `npx vitest run` — PASS. Screenshot the recipe list and a recipe page at 375 px, light and dark.
- [ ] **Step 5: Commit** `feat(food): recipe list, recipe pages and your own recipes`.

### Task 14: Plan my week, the shopping list and Add as expense

**Files:**
- Create: `src/routes/food/PlanWeek.tsx`
- Modify: `src/routes/food/Recipes.tsx` or `src/routes/Food.tsx` (entry link), `src/routes/money/AddTransaction.tsx`, `src/components/AmountKeypad.tsx` only if needed for a prefilled value
- Test: `src/routes/__tests__/planWeek.test.tsx`, `src/routes/__tests__/money.test.tsx`

**Interfaces:**
- Consumes: `listRecipes`, `weekShoppingList`, `formatPence`, `parsePence`.
- Produces: route `/food/plan`: recipes as list rows each with a portions control (− / count / +, 0 = not picked), then the combined shopping list (ingredient, grams, estimated cost), "Estimated total £x.xx (by weight; packs can cost more if you can't use the rest)" and the "Prices estimated October 2026" note, and an **Add as expense** button that opens `/money/add?kind=expense&amount=<pounds.pence>&category=cat-groceries`; `AddTransaction` reads `amount` (validated with `parsePence`, ignored if invalid) and `category` (must be an existing expense category) from the query and starts with them filled, so the user can confirm or edit.

- [ ] **Step 1: Write the failing tests:** "picking 2 portions of two recipes shows one merged line for a shared ingredient with the summed grams"; "the total equals the sum of the line costs"; "setting a recipe back to 0 portions removes its ingredients"; "with nothing picked, the page invites picking and Add as expense is disabled"; "Add as expense opens the add screen with the total prefilled and Groceries selected, and saving creates a groceries expense of that amount"; "an invalid amount in the URL is ignored"; "a missing price shows the list as incomplete and names the ingredient"; "hide calorie numbers: no kcal on this screen"; "the plan isn't stored: reopening starts empty".
- [ ] **Step 2:** Run `npx vitest run src/routes/__tests__/planWeek src/routes/__tests__/money` — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run` — PASS. Screenshot the shopping list at 375 px, light and dark.
- [ ] **Step 5: Commit** `feat(food): plan my week with a shopping list and add as expense`.

---

## Finish (the controller, after Task 14)

- [ ] Run the final whole-branch review (`superpowers:requesting-code-review`, most capable model) with this plan's Review Focus section; fix Critical and Important findings test-first.
- [ ] Run `npx vitest run`, `npx tsc --noEmit` and `npm run build`; all must pass.
- [ ] Browser checks against `npm run build && npx vite preview`: the offline reload and backup/restore scripts still pass; seeded content appears for an existing profile without duplicates.
- [ ] Screenshot at 375 px in light and dark: the programme chooser, the Next workout card, the recipe list, a recipe page and the shopping list; check each against the Design system section and remove anything that doesn't earn its place.
- [ ] Update `docs/manual-testing.md` (start a programme and finish a workout on a phone; log a recipe; edit a price; plan a week and add the expense) and append the decisions above to the base plan's Amendments.
- [ ] Push to `main` and the working branch.
