-- ============================================================================
-- LearnOS v1.1 initial schema (Supabase PostgreSQL)
-- Migration: 20260822_learnos_initial_schema.sql
-- Ground truth for Sprint 0 (Doc 05 §5–§7). FORWARD-ONLY — never hand-edit
-- applied migrations; append a new file instead.
--
-- Idempotent-safe re-run: every statement guards existence (DO blocks /
-- IF NOT EXISTS / DROP-then-CREATE policies). No destructive downgrades.
--
-- Parity-checked against prisma/schema.prisma via introspection diff in CI.
-- ============================================================================

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN duplicate_object OR SQLSTATE '23505' THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE tenant_tier AS ENUM ('CONSUMER_A','MINOR_B','ENTERPRISE_C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE modality AS ENUM ('STEPWISE','EXAMPLES','VISUAL','HANDS_ON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mastery_status AS ENUM ('SOLID','PARTIAL','NEEDS_WORK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('ACTIVE','COMPLETED','ABANDONED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_mode AS ENUM ('PROFILER','DIAGNOSTICIAN','TUTOR','SOCRATIC_COACH','ASSESSOR','SESSION_REVIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(255) NOT NULL,
  tier_type       tenant_tier NOT NULL DEFAULT 'CONSUMER_A',
  security_policy jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clerk_id                   varchar(128) NOT NULL UNIQUE,
  email                      varchar(255) NOT NULL UNIQUE,
  full_name                  varchar(255),
  is_minor                   boolean NOT NULL DEFAULT false,
  parental_consent_verified  boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_active_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users(tenant_id);

CREATE TABLE IF NOT EXISTS learner_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  default_modality modality NOT NULL DEFAULT 'EXAMPLES',
  goal_preferences jsonb NOT NULL DEFAULT '{}',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Curriculum DAG store
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id             varchar(64) PRIMARY KEY,
  title          varchar(255) NOT NULL,
  category       varchar(128) NOT NULL,
  exam_board     varchar(128),
  total_concepts integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concept_nodes (
  id                    varchar(64) PRIMARY KEY,
  subject_id            varchar(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title                 varchar(255) NOT NULL,
  difficulty_level      integer NOT NULL DEFAULT 1,
  canonical_definitions jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS concept_nodes_subject_id_idx ON concept_nodes(subject_id);

CREATE TABLE IF NOT EXISTS concept_prerequisites (
  concept_id      varchar(64) NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  prerequisite_id varchar(64) NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, prerequisite_id),
  CHECK (concept_id <> prerequisite_id)              -- self-loop guard at DB layer
);

-- ---------------------------------------------------------------------------
-- Learner state (Learning DNA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_dna (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id       varchar(64) NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  mastery_score    double precision NOT NULL DEFAULT 0.0,
  status           mastery_status NOT NULL DEFAULT 'NEEDS_WORK',
  decay_rate       double precision NOT NULL DEFAULT 0.05,
  last_reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_dna_user_concept_uq UNIQUE (user_id, concept_id)
);
CREATE INDEX IF NOT EXISTS learning_dna_user_status_idx ON learning_dna(user_id, status);
CREATE INDEX IF NOT EXISTS learning_dna_last_reviewed_idx ON learning_dna(last_reviewed_at);   -- B-02 decay cursor batches

-- ---------------------------------------------------------------------------
-- Sessions & deterministic state machine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id           varchar(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  target_duration_min  integer NOT NULL,
  calibrated_level     varchar(64),
  pre_knowledge_score  double precision,
  post_knowledge_score double precision,
  status               session_status NOT NULL DEFAULT 'ACTIVE',
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_status_idx ON sessions(user_id, status);

CREATE TABLE IF NOT EXISTS session_checkpoints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  step_number   integer NOT NULL,
  active_mode   ai_mode NOT NULL,
  state_payload jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_checkpoints_session_step_uq UNIQUE (session_id, step_number)  -- two-phase commit idempotency (B-01)
);
CREATE INDEX IF NOT EXISTS session_checkpoints_session_step_idx ON session_checkpoints(session_id, step_number);

CREATE TABLE IF NOT EXISTS session_turns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_index         integer NOT NULL,
  user_message       text NOT NULL,
  assistant_response text NOT NULL,
  latency_ms         integer NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_turns_session_turn_idx ON session_turns(session_id, turn_index);

CREATE TABLE IF NOT EXISTS assessment_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  concept_id     varchar(64) NOT NULL,
  tier_level     integer NOT NULL,
  question       text NOT NULL,
  learner_answer text NOT NULL,
  verdict        varchar(32) NOT NULL,
  score_percent  double precision NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_records_session_concept_idx ON assessment_records(session_id, concept_id);

CREATE TABLE IF NOT EXISTS spaced_rep_queue (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id           varchar(64) NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  scheduled_for        timestamptz NOT NULL,
  review_interval_days integer NOT NULL DEFAULT 1,
  completed            boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spaced_rep_queue_due_idx ON spaced_rep_queue(user_id, scheduled_for, completed);

-- ---------------------------------------------------------------------------
-- Credentialing (F10)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  varchar(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title       varchar(128) NOT NULL,
  description text NOT NULL,
  icon_url    varchar(255) NOT NULL,
  criteria    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_badges_user_badge_uq UNIQUE (user_id, badge_id)                    -- idempotent awards
);

CREATE TABLE IF NOT EXISTS certificates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id        varchar(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  verification_code varchar(64) NOT NULL UNIQUE,
  certificate_url   varchar(255) NOT NULL,
  issued_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- AI cost/cache telemetry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_execution_audits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  model_used       varchar(64) NOT NULL,
  prompt_cache_hit boolean NOT NULL DEFAULT false,
  input_tokens     integer NOT NULL,
  output_tokens    integer NOT NULL,
  cost_gbp         double precision NOT NULL,
  latency_ms       integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_execution_audits_session_idx ON ai_execution_audits(session_id);

-- ============================================================================
-- Row-Level Security enclaves (S0-T2 / Doc 05 §7 / B-03)
-- Non-superuser app roles; FORCE RLS so table owners cannot bypass either.
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_learner')    THEN CREATE ROLE app_learner    NOLOGIN; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_instructor') THEN CREATE ROLE app_instructor NOLOGIN; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin')      THEN CREATE ROLE app_admin      NOLOGIN; END IF;
END $$;

ALTER TABLE session_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_turns FORCE ROW LEVEL SECURITY;

-- RLS Policy: educator cohort view respecting Tier B Minor Privacy Override.
-- Visibility contract (truth-table tested):
--   * SELF: a user always sees turns of their own sessions.
--   * INSTRUCTOR/ADMIN same-tenant cohort: raw access ONLY when the target is
--     an adult OR parental consent is verified (B-03 Tier B > C precedence).
--   * Everyone else (learners viewing others, any cross-tenant actor): DENY.
-- NOTE: current_setting(name, true) yields EMPTY STRING (not NULL) after a
-- rolled-back SET LOCAL cycle, so every ::uuid cast must pass through
-- NULLIF(..., '') to stay null-safe (S5 lock.enforcement regression).
DROP POLICY IF EXISTS educator_cohort_transcript_policy ON session_turns;
CREATE POLICY educator_cohort_transcript_policy ON session_turns
    FOR SELECT
    USING (
        -- Can view if user is self
        session_id IN (
            SELECT id FROM sessions
            WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
        OR
        -- Can view if educator/admin, BUT ONLY IF user is NOT a minor OR parental consent is explicitly verified
        (
            current_setting('app.current_user_role', true) IN ('ADMIN', 'INSTRUCTOR')
            AND session_id IN (
                SELECT s.id FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE u.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
                AND (u.is_minor = FALSE OR u.parental_consent_verified = TRUE)
            )
        )
    );

-- Least-privilege grants for app roles (session_checkpoints is append-only:
-- no UPDATE/DELETE ever granted — Doc 05 §11).
GRANT USAGE ON SCHEMA public TO app_learner, app_instructor, app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_learner, app_instructor, app_admin;
REVOKE UPDATE, DELETE ON session_checkpoints FROM app_learner, app_instructor, app_admin;
REVOKE INSERT, UPDATE, DELETE ON tenants FROM app_learner, app_instructor;
GRANT INSERT, UPDATE, DELETE ON tenants TO app_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_admin;

-- ---------------------------------------------------------------------------
-- S4-T8 (B-02) — decay re-entry guard. Rows decayed within the last 24h are
-- skipped by the rolling worker, making chunk replay structurally idempotent.
-- ---------------------------------------------------------------------------
ALTER TABLE learning_dna ADD COLUMN IF NOT EXISTS last_decayed_at timestamptz;
CREATE INDEX IF NOT EXISTS learning_dna_last_decayed_idx ON learning_dna(last_decayed_at);

-- ============================================================================
-- Sprint 5 — Privacy Enclaves, Credentialing & Educator Portal
-- ============================================================================

-- ---------------------------------------------------------------------------
-- S5-T6 (Doc 03 §10 / F11) — educator syllabus topic locking. Locked concepts
-- are excluded from every roadmap plan generated for the cohort until the
-- educator releases the topic. Unique per (tenant, concept).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohort_topic_locks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  concept_id varchar(64) NOT NULL,
  locked_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  reason     varchar(255) NOT NULL DEFAULT '',
  locked_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_topic_locks_tenant_concept_uq UNIQUE (tenant_id, concept_id)
);
CREATE INDEX IF NOT EXISTS cohort_topic_locks_tenant_idx ON cohort_topic_locks(tenant_id);

-- ---------------------------------------------------------------------------
-- S5-T2 (Doc 04 §7.1) — parental consent audit trail. Every issued/revoked
-- consent token is recorded; jti uniqueness makes replayed tokens detectable
-- at rest as well as at verification time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      varchar(16) NOT NULL CHECK (action IN ('ISSUE', 'REVOKE')),
  guardian_ref varchar(255) NOT NULL DEFAULT '',
  jti         varchar(64),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_events_jti_uq UNIQUE (jti)
);
CREATE INDEX IF NOT EXISTS consent_events_user_idx ON consent_events(user_id);

-- ---------------------------------------------------------------------------
-- S5-T3 (B-03 defense in depth) — aggregation service role. Reads only
-- aggregate-safe tables for cohort analytics; raw transcripts are NEVER
-- granted to this role (absence of grant = deny under least privilege).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_aggregator') THEN CREATE ROLE app_aggregator NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO app_aggregator;
GRANT SELECT ON learning_dna, assessment_records, concept_nodes, subjects,
               badges, user_badges, certificates TO app_aggregator;
