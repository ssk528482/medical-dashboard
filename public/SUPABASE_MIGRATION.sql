-- =====================================================================
-- Medical Study OS — Supabase Schema Migration
-- Run this in your Supabase SQL Editor
-- This replaces the single study_data JSON blob with a proper
-- normalized schema. The old study_data table is kept for rollback.
-- =====================================================================

-- ── 1. SUBJECTS ───────────────────────────────────────────────────────
-- One row per subject per user.
CREATE TABLE IF NOT EXISTS subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  size          TEXT NOT NULL DEFAULT 'medium',  -- 'small' | 'medium' | 'large'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- ── 2. UNITS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  subject_name    TEXT NOT NULL,
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  question_count  INTEGER NOT NULL DEFAULT 0,
  qbank_total     INTEGER NOT NULL DEFAULT 0,
  qbank_correct   INTEGER NOT NULL DEFAULT 0,
  qbank_done      BOOLEAN NOT NULL DEFAULT false,
  collapsed       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_id, name)
);

-- ── 3. CHAPTERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  subject_name     TEXT NOT NULL,
  unit_name        TEXT NOT NULL,
  name             TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'not-started', -- 'not-started' | 'completed'
  difficulty       TEXT NOT NULL DEFAULT 'medium',       -- 'easy' | 'medium' | 'hard'
  difficulty_factor FLOAT NOT NULL DEFAULT 2.5,
  missed_revisions INTEGER NOT NULL DEFAULT 0,
  start_page       INTEGER NOT NULL DEFAULT 0,
  end_page         INTEGER NOT NULL DEFAULT 0,
  page_count       INTEGER NOT NULL DEFAULT 0,
  completed_on     DATE,
  last_reviewed_on DATE,
  next_revision    DATE,
  revision_index   INTEGER NOT NULL DEFAULT 0,
  -- Store only last 10 revision dates — not unlimited growth
  revision_dates   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, name)
);

-- ── 4. USER META (replaces the non-subject parts of study_data) ───────
-- One row per user. Stores: exam date, start date, settings, pointers, ui state.
CREATE TABLE IF NOT EXISTS user_meta (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_date        DATE NOT NULL DEFAULT '2026-12-01',
  start_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  reading_speed    INTEGER NOT NULL DEFAULT 25,
  qbank_speed      INTEGER NOT NULL DEFAULT 30,
  user_name        TEXT,
  setup_complete   BOOLEAN NOT NULL DEFAULT false,
  -- subject pointers: { "Anatomy": { unit: 0, chapter: 2 }, ... }
  subject_pointers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ui collapse state: { "editorCollapsed": {...}, "unitCollapsed": {...} }
  ui_state         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- daily plan (today only, small payload)
  daily_plan       JSONB,
  version          INTEGER NOT NULL DEFAULT 5,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. DAILY HISTORY ──────────────────────────────────────────────────
-- One row per day per user. Solves the unbounded dailyHistory blob problem.
-- Old approach: one giant JSON grows forever in a single row.
-- New approach: one row per day — queryable, trimable, indexable.
CREATE TABLE IF NOT EXISTS daily_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  study             BOOLEAN NOT NULL DEFAULT false,
  qbank             BOOLEAN NOT NULL DEFAULT false,
  revision          BOOLEAN NOT NULL DEFAULT false,
  evening_submitted BOOLEAN NOT NULL DEFAULT false,
  study_subject     TEXT,
  study_entries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  qbank_entries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  revised_items     JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_tracking     JSONB,
  submitted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ── 6. ALERT DISMISSALS ───────────────────────────────────────────────
-- Stores snoozed / dismissed intelligence alerts (fixes task #8)
CREATE TABLE IF NOT EXISTS alert_dismissals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key   TEXT NOT NULL,   -- e.g. "neglected:Anatomy" or "burnout"
  snoozed_until DATE,          -- null = permanently dismissed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, alert_key)
);

-- ── 7. INDEXES ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subjects_user     ON subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_units_subject     ON units(subject_id);
CREATE INDEX IF NOT EXISTS idx_units_user        ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_unit     ON chapters(unit_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user     ON chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_revision ON chapters(user_id, next_revision) WHERE next_revision IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_user_date   ON daily_history(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_dismissals_user   ON alert_dismissals(user_id);

-- ── 8. ROW LEVEL SECURITY ─────────────────────────────────────────────
ALTER TABLE subjects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE units            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_meta        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "subjects_own"         ON subjects         USING (user_id = auth.uid());
CREATE POLICY "units_own"            ON units            USING (user_id = auth.uid());
CREATE POLICY "chapters_own"         ON chapters         USING (user_id = auth.uid());
CREATE POLICY "user_meta_own"        ON user_meta        USING (user_id = auth.uid());
CREATE POLICY "daily_history_own"    ON daily_history    USING (user_id = auth.uid());
CREATE POLICY "alert_dismissals_own" ON alert_dismissals USING (user_id = auth.uid());

-- ── 9. AUTO-UPDATE updated_at TRIGGER ────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subjects_updated      BEFORE UPDATE ON subjects      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_units_updated         BEFORE UPDATE ON units         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_chapters_updated      BEFORE UPDATE ON chapters      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_meta_updated     BEFORE UPDATE ON user_meta     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_daily_history_updated BEFORE UPDATE ON daily_history FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================================
-- WHY THIS IS BETTER THAN A SINGLE JSON BLOB:
--
--  OLD: study_data table — 1 row per user, entire app state in data JSONB
--    ❌ Row grows forever as dailyHistory accumulates
--    ❌ Any change writes the ENTIRE blob (heavy I/O)
--    ❌ Cannot query "show me all chapters due this week" in SQL
--    ❌ Cannot trim old history without parsing JSON in app
--    ❌ Merge conflicts lose data
--    ❌ localStorage hits 5MB limit after ~1 year of daily use
--    ❌ No referential integrity - can corrupt silently
--
--  NEW: Normalized tables
--    ✅ Daily history: one row per day - old rows never touched
--    ✅ Chapters: indexed on next_revision - SQL can query due chapters
--    ✅ Granular saves - updating one chapter only writes one row
--    ✅ Merge conflicts impossible - each record owns its own row
--    ✅ Can archive/delete old daily_history rows without affecting anything
--    ✅ localStorage only caches lightweight meta + today's plan
--    ✅ Full referential integrity with ON DELETE CASCADE
--    ✅ Scales to thousands of chapters and years of history
-- =====================================================================
