Minimal context: this is the canonical PostgreSQL DDL for JobTrackr. Column names are globally descriptive; CVs and generated CVs are stored as binaries in Cloudflare R2 and referenced here only by URL/key.

```sql
-- =====================================================================
-- 1. ENUM TYPES (CONTROLLED VOCABULARIES)
-- ---------------------------------------------------------------------
-- These enums back UI dropdowns and Kanban columns. Keep values stable
-- because they are persisted in data and referenced in application code.
-- =====================================================================

-- Application status (maps 1:1 to board columns)
CREATE TYPE application_status AS ENUM (
  'APPLIED',
  'IN_REVIEW',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN'
);

-- Interview kind / format
CREATE TYPE interview_type AS ENUM (
  'PHONE',
  'TECHNICAL',
  'ARCHITECTURE',
  'HR',
  'FINAL',
  'OTHER'
);

-- Outcome of an interview step
CREATE TYPE interview_outcome AS ENUM (
  'PENDING',
  'PASSED',
  'FAILED',
  'CANCELLED'
);

-- Work modality of the job
CREATE TYPE remote_type AS ENUM (
  'ON_SITE',
  'HYBRID',
  'REMOTE'
);

-- High-level grouping for tags (for filters, not for permissions)
CREATE TYPE tag_category AS ENUM (
  'TECH_STACK',
  'COMPANY_TYPE',
  'MODALITY',
  'OTHER'
);

-- Type of reminder / task associated to an application
CREATE TYPE task_type AS ENUM (
  'FOLLOW_UP',
  'INTERVIEW_PREP',
  'DEADLINE',
  'OTHER'
);


-- =====================================================================
-- 2. CORE ENTITIES (USERS, COMPANIES, APPLICATIONS)
-- =====================================================================

-- TABLE: users
-- One row per JobTrackr account. This is the tenancy root for all
-- user-owned data.
CREATE TABLE users (
  user_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email       VARCHAR(255) UNIQUE NOT NULL,  -- login / contact email
  user_first_name  VARCHAR(255),                  -- optional profile info
  user_last_name   VARCHAR(255),                  -- normalized (no full_name)
  user_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE: companies
-- Global companies (company_user_id IS NULL) are pre-seeded and readable by all users.
-- User-created companies belong to one user and are writable only by that owner.
-- Different users can still create their own company with the same name as a global one
-- only if the service duplicate check allows it; global names are reserved.
CREATE TABLE companies (
  company_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_user_id     UUID REFERENCES users(user_id) ON DELETE CASCADE,

  company_name        VARCHAR(255) NOT NULL,
  company_website_url VARCHAR(1024),
  company_location    VARCHAR(255),
  company_type        VARCHAR(100),
  company_logo        VARCHAR(1024),              -- Hunter.io URL: https://logos.hunter.io/<domain>

  company_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX companies_global_name_unique
  ON companies (company_name) WHERE company_user_id IS NULL;

CREATE UNIQUE INDEX companies_user_name_unique
  ON companies (company_user_id, company_name) WHERE company_user_id IS NOT NULL;

-- TABLE: applications
-- Central entity: one row per job application a user is tracking.
-- Ties together the user, company, job info, salary band and Kanban state.
CREATE TABLE applications (
  application_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_user_id        BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE CASCADE,
  application_company_id     BIGINT NOT NULL
    REFERENCES companies(company_id) ON DELETE RESTRICT,

  application_title          VARCHAR(255) NOT NULL,  -- job title as shown
  application_job_url        VARCHAR(1024),          -- link to job posting
  application_location       VARCHAR(255),           -- job location text
  application_remote_type    remote_type,            -- ON_SITE / HYBRID / REMOTE
  application_source         VARCHAR(255),           -- where it was found (LinkedIn, etc.)

  application_salary_min     NUMERIC(12,2),          -- lower bound of range
  application_salary_max     NUMERIC(12,2),          -- upper bound of range
  application_currency       CHAR(3),                -- ISO currency code

  application_status         application_status NOT NULL,
  application_kanban_order   INTEGER NOT NULL DEFAULT 0, -- position inside column

  application_applied_at     TIMESTAMPTZ,            -- when user actually applied
  application_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_salary_range_valid CHECK (
    application_salary_min IS NULL
    OR application_salary_max IS NULL
    OR application_salary_max >= application_salary_min
  )
);

-- For dashboard queries: "all apps for user by status"
CREATE INDEX idx_applications_user_status
  ON applications (application_user_id, application_status);

-- For company-specific views
CREATE INDEX idx_applications_company
  ON applications (application_company_id);


-- =====================================================================
-- 3. TAGGING (MANY-TO-MANY BETWEEN APPLICATIONS AND TAGS)
-- =====================================================================

-- TABLE: tags
-- Global tag dictionary per DB. Each tag has a category and a color.
-- No timestamps to keep this table minimal.
CREATE TABLE tags (
  tag_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_category tag_category NOT NULL,        -- logical group for filters
  tag_name     VARCHAR(100) NOT NULL UNIQUE, -- human-readable name
  tag_color    CHAR(7) NOT NULL DEFAULT '#808080'  -- HEX color, default gray
);

-- TABLE: application_tags
-- Join table linking applications to tags (N:N). Composite PK to avoid
-- duplicates and enable efficient lookups.
CREATE TABLE application_tags (
  application_tags_application_id BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,
  application_tags_tag_id         BIGINT NOT NULL
    REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (application_tags_application_id, application_tags_tag_id)
);


-- =====================================================================
-- 4. INTERVIEWS, STATUS HISTORY, TASKS (TIMELINE + REMINDERS)
-- =====================================================================

-- TABLE: interviews
-- Individual interview events tied to a specific application.
-- Duration and rating were intentionally removed to keep UX focused.
CREATE TABLE interviews (
  interview_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interview_application_id   BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  interview_type             interview_type NOT NULL, -- PHONE, TECHNICAL, etc.
  interview_scheduled_at     TIMESTAMPTZ NOT NULL,    -- interview datetime
  interview_location         VARCHAR(255),            -- Zoom, office address, etc.
  interview_notes            TEXT,                    -- free-form notes
  interview_outcome          interview_outcome NOT NULL DEFAULT 'PENDING',

  interview_created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interview_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For timeline views per application
CREATE INDEX idx_interviews_application_date
  ON interviews (interview_application_id, interview_scheduled_at);

-- TABLE: status_history
-- Append-only log of status transitions for an application. No changed_by
-- because only the end user is allowed to change statuses.
CREATE TABLE status_history (
  status_history_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_history_application_id BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  status_history_old_status     application_status,
  status_history_new_status     application_status NOT NULL,
  status_history_changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_history_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_application_date
  ON status_history (status_history_application_id, status_history_changed_at);

-- TABLE: application_tasks
-- Reminder / next-action items connected to an application (follow-ups,
-- deadlines, prep, etc.).
CREATE TABLE application_tasks (
  application_task_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_task_application_id   BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  application_task_type             task_type NOT NULL,
  application_task_title            VARCHAR(255) NOT NULL, -- short actionable label
  application_task_description      TEXT,                  -- optional longer notes

  application_task_due_at           TIMESTAMPTZ NOT NULL, -- when the task is due
  application_task_completed_at     TIMESTAMPTZ,          -- null if still open

  application_task_created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application_task_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_tasks_application_due
  ON application_tasks (application_task_application_id, application_task_due_at);

CREATE INDEX idx_application_tasks_due_completed
  ON application_tasks (application_task_due_at, application_task_completed_at);


-- =====================================================================
-- 5. SAVED VIEWS (PER-USER FILTER PRESETS)
-- =====================================================================

-- TABLE: saved_views
-- User-defined saved filters for the board. Name must be descriptive
-- enough; there is no description field.
CREATE TABLE saved_views (
  saved_view_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  saved_view_user_id     BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE CASCADE,

  saved_view_name        VARCHAR(255) NOT NULL,   -- label shown in UI
  saved_view_is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  saved_view_filters_json JSONB NOT NULL,         -- serialized filter config

  saved_view_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_view_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Avoid duplicate view names per user
CREATE UNIQUE INDEX idx_saved_views_user_name
  ON saved_views (saved_view_user_id, saved_view_name);


-- =====================================================================
-- 6. CVS AND JOB DESCRIPTIONS (R2-BASED STORAGE)
-- =====================================================================

-- TABLE: cv_base
-- Stores the pointer to the user's base CV in Cloudflare R2. Exactly one
-- base CV per user (enforced via UNIQUE on cv_base_user_id).
CREATE TABLE cv_base (
  cv_base_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cv_base_user_id     BIGINT NOT NULL UNIQUE
    REFERENCES users(user_id) ON DELETE CASCADE,

  cv_base_location    VARCHAR(1024) NOT NULL, -- R2 URL or object key
  cv_base_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE: job_descriptions
-- One-to-one with applications. Caches the full job ad text at the time
-- the application is created so AI and analytics don't depend on re-
-- scraping external sites.
CREATE TABLE job_descriptions (
  job_description_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_description_application_id BIGINT NOT NULL UNIQUE
    REFERENCES applications(application_id) ON DELETE CASCADE,

  job_description_text           TEXT NOT NULL,
  job_description_fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE: application_cvs
-- Versioned, per-application generated CVs. Each row points to a CV file
-- in R2 and captures metadata like tone.
CREATE TABLE application_cvs (
  application_cv_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_cv_application_id BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  application_cv_version        INTEGER NOT NULL,          -- 1, 2, 3, ... per app
  application_cv_location       VARCHAR(1024) NOT NULL,    -- R2 URL or object key
  application_cv_tone           VARCHAR(50),               -- e.g. "formal", "casual"
  application_cv_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_application_cvs_version
    UNIQUE (application_cv_application_id, application_cv_version)
);

CREATE INDEX idx_application_cvs_application
  ON application_cvs (application_cv_application_id);
```
