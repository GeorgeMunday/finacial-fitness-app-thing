# Programmes and recipes: product brief (verbatim from the product owner, 2026-10-13)

Add two features to Tally: pre-loaded workout programmes and pre-planned easy recipes. Follow the original plan's Global Constraints and Design system section throughout.

## PART 1: PRE-LOADED WORKOUT PROGRAMMES

Users should be able to pick a programme instead of building workouts from scratch. Ship these as seed data (programmes, days, exercises, sets and reps, progression rule). Write all descriptions in your own words and credit the original authors where a programme has one; don't copy text from websites.

1. Push / Pull / Legs (3 or 6 days a week; the user picks)
   - Push: Bench press 4×6–8, Overhead press 3×8–10, Incline dumbbell press 3×8–12, Lateral raise 3×12–15, Triceps pushdown 3×10–12
   - Pull: Deadlift 3×5, Lat pulldown or pull-up 3×8–10, Seated cable row 3×10–12, Face pull 3×15, Dumbbell curl 3×10–12
   - Legs: Squat 4×6–8, Romanian deadlift 3×8–10, Leg press 3×10–12, Leg curl 3×10–12, Standing calf raise 4×12–15
   - Progression: double progression. When every set hits the top of the rep range, add 2.5 kg (upper body) or 5 kg (lower body) next time.

2. Upper / Lower, 4 days (power + hypertrophy, PHUL-style; credit Brandon Campbell)
   - Upper power: Bench press 3×3–5, Barbell row 3×3–5, Overhead press 3×6–8, Lat pulldown 3×6–10, Barbell curl 2×6–10, Skull crusher 2×6–10
   - Lower power: Squat 3×3–5, Deadlift 3×3–5, Leg press 3×10–15, Leg curl 3×6–10, Calf raise 4×6–10
   - Upper hypertrophy: Incline dumbbell press 3×8–12, Dumbbell fly 3×8–12, Seated cable row 3×8–12, One-arm dumbbell row 3×8–12, Lateral raise 3×10–15, Incline dumbbell curl 3×8–12, Triceps pushdown 3×8–12
   - Lower hypertrophy: Front squat 3×8–12, Walking lunge 3×8–12 each leg, Leg extension 3×10–15, Leg curl 3×10–15, Seated calf raise 4×8–12
   - Progression: double progression, as above.

3. Full body beginner, 3 days a week, alternating A/B
   - A: Squat 3×5, Bench press 3×5, Barbell row 3×5, Chin-up 3×as many as possible
   - B: Squat 3×5, Overhead press 3×5, Deadlift 1×5, Chin-up 3×as many as possible
   - Progression: linear. Add 2.5 kg each successful session (5 kg on deadlift). After 3 failed sessions on a lift, drop it 10% (a deload).

4. GZCLP, 4 days (credit Cody Lefever)
   - Day 1: T1 Squat, T2 Bench press, T3 Lat pulldown
   - Day 2: T1 Overhead press, T2 Deadlift, T3 Dumbbell row
   - Day 3: T1 Bench press, T2 Squat, T3 Lat pulldown
   - Day 4: T1 Deadlift, T2 Overhead press, T3 Dumbbell row
   - T1: 5×3, last set as many as possible; add weight each success; on failure go 5×3 → 6×2 → 10×1, then retest.
   - T2: 3×10; on failure go 3×10 → 3×8 → 3×6, then reset with more weight.
   - T3: 3×15, last set as many as possible; add weight when the last set reaches 25+ reps.

5. 5/3/1 for Beginners, 3 days (credit Jim Wendler)
   - Day 1: Squat + Bench press. Day 2: Deadlift + Overhead press. Day 3: Bench press + Squat.
   - Training max = 90% of 1RM (ask the user, or estimate from logged PRs).
   - 3-week cycle on the main sets: week 1 65/75/85% × 5, 5, 5+; week 2 70/80/90% × 3, 3, 3+; week 3 75/85/95% × 5, 3, 1+. Then 5×5 at the first set's weight (first set last).
   - Assistance: 50–100 reps each of push, pull and single-leg/core, chosen by the user.
   - After each cycle, add 5 kg to the lower-body training max and 2.5 kg to the upper-body one.

What the app needs:
- Schema: programmes, programme_days (ordered), programme_day_exercises (sets, rep min/max, tier, percent, is_amrap), and programme_progress (user's current day, current stage per lift, training maxes). Add a migration.
- Every exercise above must exist in the exercise seed. Add any missing ones, mapped to free-exercise-db where possible.
- A "Choose a programme" screen in Train: one row per programme showing days a week and level, a short description, a preview of each day, and a "Start this programme" button. Ask for starting weights, or training maxes for 5/3/1, with "I don't know" giving sensible empty-bar defaults.
- Train shows "Next: Pull day" and starts that workout pre-filled with the suggested weights. Users can still swap an exercise, skip a set or log extra sets.
- "Copy and edit" turns any programme into the user's own routine set.
- Domain functions with tests written first: nextWorkout(db, onDate); suggestWeights(db, programmeDayId); applyProgression(db, workoutId). Cover every progression type above: double progression, linear plus deload after 3 fails, the GZCLP T1/T2/T3 stage changes, and the 5/3/1 week percentages with weights rounded to 2.5 kg (or 5 lb).

## PART 2: PRE-PLANNED EASY RECIPES

Write original recipes (don't copy recipe text from websites). UK supermarket ingredients and no dietary restrictions.
- Every recipe: at least 30 g protein per portion.
- Estimated cost: around £2 a portion or less.
- Batch recipes: make 3–5 portions.
- Quick recipes: 15 minutes or less of hands-on time.
- Each recipe: ingredients in grams, short numbered steps, prep and cook time, number of portions, tags (batch, quick, breakfast, lunch, dinner, freezer-friendly), and how long it keeps in the fridge.

Start with these 12. Adjust quantities so each hits the targets:

Batch:
- Chicken thigh, rice and pepper traybake
- Turkey mince chilli with kidney beans
- Beef and lentil bolognese
- Chicken tikka-style curry with Greek yoghurt and rice
- Tuna pasta bake
- Turkey meatballs in tomato sauce
- Egg, ham and spinach muffins
- Overnight oats with Greek yoghurt and whey (5 jars)

Quick:
- Tuna, sweetcorn and cottage cheese jacket potato (microwave)
- Chicken and veg egg-fried rice (microwave rice)
- Scrambled eggs and beans on toast
- Greek yoghurt protein pot (yoghurt, whey, frozen berries, oats)

What the app needs:
- Schema: extend meals into recipes (kind 'meal'|'recipe', servings, prep_minutes, cook_minutes, steps JSON, tags JSON, fridge_days, source 'tally'|'user'). Add recipe_id to food_logs. Migration required.
- Nutrition per portion is computed from the ingredients in the food database, never hard-coded. If an ingredient isn't in the food database, add it to the seed with its source marked honestly.
- Cost per portion comes from product_prices: seed estimated UK supermarket prices with a "prices estimated <month year>" note. Users can edit the price of any ingredient. Show cost per portion and protein per £. Don't scrape supermarket sites.
- A Recipes screen in Food: filters for Batch, Quick, Breakfast, Lunch and Dinner, and sort by cost, protein or time. A recipe detail page with "Log a portion" (one tap; writes a food log with a nutrition snapshot), "Copy and edit" and "Save as my recipe".
- Plan my week: pick recipes and portions to get a combined shopping list with quantities and an estimated total. "Add as expense" pre-fills a groceries expense with that total, which the user confirms or edits.
- Users can create their own recipes from foods they've logged.
- Safety rules apply: respect "Hide calorie numbers" on recipe cards and detail pages, and no "clean", "guilt-free" or "cheat" language.
- Domain functions with tests written first: recipeNutrition(db, recipeId) per portion; recipeCost(db, recipeId) per portion and in total; logRecipe(db, recipeId, portions, slot, logDate); weekShoppingList(db, selections). Tests check that portions divide correctly, edited prices change cost but not past logs, logging 2 portions doubles the snapshot, and the shopping list merges the same ingredient across recipes.

## FINISH
- Run the full test suite, npx tsc --noEmit and npm run build.
- Screenshot at 375 px in light and dark mode: the programme chooser, the "Next workout" card, the recipe list, a recipe page and the shopping list.
- Stop and ask the product owner if any recipe can't hit 30 g protein under about £2 a portion, if an exercise is missing from free-exercise-db, or if progression rules conflict with how sets are logged today.
