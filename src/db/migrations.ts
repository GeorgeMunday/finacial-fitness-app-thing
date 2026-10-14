import type { SqlExecutor } from './executor'

export const MIGRATIONS: string[] = [
  `
CREATE TABLE categories (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('groceries','eating_out','takeaway','fitness','supplements','bills','transport','shopping','income','other')));
CREATE TABLE transactions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, kind TEXT NOT NULL CHECK (kind IN ('expense','income')), log_date TEXT NOT NULL, amount_pence INTEGER NOT NULL CHECK (amount_pence > 0), currency TEXT NOT NULL DEFAULT 'GBP', merchant TEXT, category_id TEXT NOT NULL REFERENCES categories(id), note TEXT, source TEXT);
CREATE TABLE budgets (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, category_id TEXT NOT NULL REFERENCES categories(id), period TEXT NOT NULL CHECK (period IN ('week','month')), limit_pence INTEGER NOT NULL);
CREATE TABLE recurring_rules (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, kind TEXT NOT NULL CHECK (kind IN ('expense','income')), name TEXT NOT NULL, amount_pence INTEGER NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), cadence TEXT NOT NULL CHECK (cadence IN ('weekly','monthly','yearly')), next_date TEXT NOT NULL);
CREATE TABLE savings_goals (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, name TEXT NOT NULL, period TEXT NOT NULL CHECK (period IN ('month','year','once')), target_pence INTEGER NOT NULL, start_date TEXT, target_date TEXT, archived_at TEXT);
CREATE TABLE savings_contributions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, goal_id TEXT NOT NULL REFERENCES savings_goals(id), log_date TEXT NOT NULL, amount_pence INTEGER NOT NULL, note TEXT);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
CREATE TABLE transaction_links (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, transaction_id TEXT NOT NULL, food_log_id TEXT, workout_id TEXT);
CREATE TABLE product_prices (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, food_id TEXT NOT NULL, price_pence INTEGER NOT NULL, pack_g REAL, shop TEXT, log_date TEXT NOT NULL);
CREATE TABLE foods (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, source TEXT NOT NULL CHECK (source IN ('user','off','cofid')), barcode TEXT, name TEXT NOT NULL, brand TEXT, kcal_100g REAL NOT NULL, protein_100g REAL NOT NULL, carbs_100g REAL NOT NULL, fat_100g REAL NOT NULL, serving_g REAL, serving_label TEXT);
CREATE TABLE meals (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, name TEXT NOT NULL);
CREATE TABLE meal_items (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, meal_id TEXT NOT NULL, food_id TEXT NOT NULL, grams REAL NOT NULL);
CREATE TABLE food_logs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, log_date TEXT NOT NULL, slot TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner','snack')), food_id TEXT, grams REAL, kcal REAL NOT NULL, protein_g REAL NOT NULL DEFAULT 0, carbs_g REAL NOT NULL DEFAULT 0, fat_g REAL NOT NULL DEFAULT 0);
CREATE TABLE body_metrics (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, log_date TEXT NOT NULL, weight_kg REAL);
CREATE TABLE exercises (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, source TEXT NOT NULL DEFAULT 'seed', name TEXT NOT NULL, primary_muscle TEXT, equipment TEXT);
CREATE TABLE routines (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, name TEXT NOT NULL);
CREATE TABLE routine_exercises (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, routine_id TEXT NOT NULL, exercise_id TEXT NOT NULL, position INTEGER NOT NULL, target_sets INTEGER NOT NULL, target_reps INTEGER NOT NULL);
CREATE TABLE workouts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, routine_id TEXT, started_at TEXT NOT NULL, ended_at TEXT, log_date TEXT NOT NULL);
CREATE TABLE workout_sets (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, workout_id TEXT NOT NULL, exercise_id TEXT NOT NULL, set_number INTEGER NOT NULL, reps INTEGER NOT NULL, weight_kg REAL NOT NULL, is_warmup INTEGER NOT NULL DEFAULT 0, completed_at TEXT NOT NULL);
CREATE INDEX idx_tx_date ON transactions(log_date);
CREATE INDEX idx_tx_kind_date ON transactions(kind, log_date);
CREATE INDEX idx_contrib_goal_date ON savings_contributions(goal_id, log_date);
CREATE INDEX idx_contrib_date ON savings_contributions(log_date);
CREATE INDEX idx_foods_barcode ON foods(barcode);
CREATE INDEX idx_food_logs_date ON food_logs(log_date);
CREATE INDEX idx_body_date ON body_metrics(log_date);
CREATE INDEX idx_workouts_date ON workouts(log_date);
CREATE INDEX idx_prices_date ON product_prices(log_date);
CREATE INDEX idx_sets_ex ON workout_sets(exercise_id, completed_at);
INSERT INTO categories (id, created_at, updated_at, name, kind) VALUES
('cat-groceries', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Groceries', 'groceries'),
('cat-eating_out', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Eating out', 'eating_out'),
('cat-takeaway', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Takeaway', 'takeaway'),
('cat-fitness', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Fitness', 'fitness'),
('cat-supplements', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Supplements', 'supplements'),
('cat-bills', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Bills', 'bills'),
('cat-transport', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Transport', 'transport'),
('cat-shopping', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Shopping', 'shopping'),
('cat-income', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Income', 'income'),
('cat-other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Other', 'other');
`,
  // v2: before this version every 'cofid' row came from the hand-written starter list (real CoFID was never
  // bundled), so relabel those rows 'starter'. SQLite can't alter a CHECK constraint, so foods is rebuilt.
  // Also stores the pay/anchor day on recurring rules so monthly dates clamp (31 → 28 → 31) instead of drifting.
  `
CREATE TABLE foods_v2 (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, source TEXT NOT NULL CHECK (source IN ('user','off','cofid','starter')), barcode TEXT, name TEXT NOT NULL, brand TEXT, kcal_100g REAL NOT NULL, protein_100g REAL NOT NULL, carbs_100g REAL NOT NULL, fat_100g REAL NOT NULL, serving_g REAL, serving_label TEXT);
INSERT INTO foods_v2 SELECT id, created_at, updated_at, deleted_at, CASE source WHEN 'cofid' THEN 'starter' ELSE source END, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label FROM foods;
DROP TABLE foods;
ALTER TABLE foods_v2 RENAME TO foods;
CREATE INDEX idx_foods_barcode ON foods(barcode);
ALTER TABLE recurring_rules ADD COLUMN anchor_day INTEGER;
UPDATE recurring_rules SET anchor_day = CAST(substr(next_date, 9, 2) AS INTEGER);
`,
  // v3: workout programmes, recipes (meals extended), recipe logs and price provenance.
  `
ALTER TABLE workouts ADD COLUMN programme_day_id TEXT;
ALTER TABLE workouts ADD COLUMN progression_applied_at TEXT;
CREATE TABLE programmes (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, author TEXT, level TEXT NOT NULL CHECK (level IN ('beginner','intermediate')), description TEXT NOT NULL, progression TEXT NOT NULL CHECK (progression IN ('double','linear','gzclp','wendler531')), days_per_week_options TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'tally' CHECK (source IN ('tally','user')), parent_id TEXT);
CREATE TABLE programme_days (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, programme_id TEXT NOT NULL REFERENCES programmes(id), position INTEGER NOT NULL, name TEXT NOT NULL);
CREATE TABLE programme_day_exercises (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, day_id TEXT NOT NULL REFERENCES programme_days(id), position INTEGER NOT NULL, exercise_id TEXT NOT NULL, alt_exercise_id TEXT, lift_key TEXT NOT NULL, tier TEXT NOT NULL CHECK (tier IN ('main','bw','t1','t2','t3','m531','fsl','assist')), sets INTEGER NOT NULL, rep_min INTEGER NOT NULL, rep_max INTEGER NOT NULL, percent REAL, week INTEGER, is_amrap INTEGER NOT NULL DEFAULT 0, increment_kg REAL, note TEXT);
CREATE TABLE programme_progress (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, programme_id TEXT NOT NULL UNIQUE REFERENCES programmes(id), active INTEGER NOT NULL DEFAULT 1, started_on TEXT, days_per_week INTEGER, next_position INTEGER NOT NULL DEFAULT 0, cycle_week INTEGER NOT NULL DEFAULT 1, lifts TEXT NOT NULL DEFAULT '{}');
CREATE INDEX idx_programme_days_prog ON programme_days(programme_id, position);
CREATE INDEX idx_programme_day_ex ON programme_day_exercises(day_id, position);
CREATE INDEX idx_workouts_prog_day ON workouts(programme_day_id);
ALTER TABLE meals ADD COLUMN kind TEXT NOT NULL DEFAULT 'meal' CHECK (kind IN ('meal','recipe'));
ALTER TABLE meals ADD COLUMN servings INTEGER NOT NULL DEFAULT 1;
ALTER TABLE meals ADD COLUMN prep_minutes INTEGER;
ALTER TABLE meals ADD COLUMN cook_minutes INTEGER;
ALTER TABLE meals ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE meals ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE meals ADD COLUMN fridge_days INTEGER;
ALTER TABLE meals ADD COLUMN source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('tally','user'));
ALTER TABLE meals ADD COLUMN key TEXT;
ALTER TABLE meals ADD COLUMN description TEXT;
ALTER TABLE meal_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_meals_key ON meals(key) WHERE key IS NOT NULL;
ALTER TABLE food_logs ADD COLUMN recipe_id TEXT;
ALTER TABLE food_logs ADD COLUMN portions REAL;
CREATE INDEX idx_food_logs_recipe ON food_logs(recipe_id);
ALTER TABLE product_prices ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
`,
  // v4: a quick add can carry a name ("Meal deal") instead of showing as "Quick add".
  `
ALTER TABLE food_logs ADD COLUMN name TEXT;
`,
]

/** Applies pending migrations, tracked in PRAGMA user_version. Returns the new version. */
export async function migrate(db: SqlExecutor): Promise<number> {
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version')
  let version = row?.user_version ?? 0
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.exec(`PRAGMA user_version = ${version + 1}`)
    })
    version += 1
  }
  return version
}
