-- Application status (Kanban columns)
CREATE TYPE application_status AS ENUM (
  'APPLIED',
  'IN_REVIEW',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN'
);

-- Interview type
CREATE TYPE interview_type AS ENUM (
  'PHONE',
  'TECHNICAL',
  'ARCHITECTURE',
  'HR',
  'FINAL',
  'OTHER'
);

-- Interview outcome
CREATE TYPE interview_outcome AS ENUM (
  'PENDING',
  'PASSED',
  'FAILED',
  'CANCELLED'
);

-- Remote modality
CREATE TYPE remote_type AS ENUM (
  'ON_SITE',
  'HYBRID',
  'REMOTE'
);

-- Tag category
CREATE TYPE tag_category AS ENUM (
  'TECH_STACK',
  'COMPANY_TYPE',
  'MODALITY',
  'OTHER'
);

-- Task / reminder type
CREATE TYPE task_type AS ENUM (
  'FOLLOW_UP',
  'INTERVIEW_PREP',
  'DEADLINE',
  'OTHER'
);

CREATE TABLE users (
  user_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email       VARCHAR(255) UNIQUE NOT NULL,
  user_first_name  VARCHAR(255),
  user_last_name   VARCHAR(255),
  user_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
  company_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_user_id     BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE CASCADE,

  company_name        VARCHAR(255) NOT NULL,
  company_website_url VARCHAR(1024),
  company_location    VARCHAR(255),
  company_type        VARCHAR(100),

  company_logo        VARCHAR(1024), -- Image URL

  company_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_user_id, company_name)
);

CREATE TABLE applications (
  application_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_user_id        BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE CASCADE,
  application_company_id     BIGINT NOT NULL
    REFERENCES companies(company_id) ON DELETE RESTRICT,

  application_title          VARCHAR(255) NOT NULL,
  application_job_url        VARCHAR(1024),
  application_location       VARCHAR(255),
  application_remote_type    remote_type,
  application_source         VARCHAR(255),

  application_salary_min     NUMERIC(12,2),
  application_salary_max     NUMERIC(12,2),
  application_currency       CHAR(3),

  application_status         application_status NOT NULL,
  application_kanban_order   INTEGER NOT NULL DEFAULT 0,

  application_applied_at     TIMESTAMPTZ,
  application_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_salary_range_valid CHECK (
    application_salary_min IS NULL
    OR application_salary_max IS NULL
    OR application_salary_max >= application_salary_min
  )
);

CREATE INDEX idx_applications_user_status
  ON applications (application_user_id, application_status);

CREATE INDEX idx_applications_company
  ON applications (application_company_id);

CREATE TABLE tags (
  tag_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_category tag_category NOT NULL,
  tag_name     VARCHAR(100) NOT NULL UNIQUE,
  tag_color    CHAR(7) NOT NULL DEFAULT '#808080'  -- gray-ish HEX color
);

CREATE TABLE application_tags (
  application_tags_application_id BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,
  application_tags_tag_id         BIGINT NOT NULL
    REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (application_tags_application_id, application_tags_tag_id)
);


CREATE TABLE interviews (
  interview_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interview_application_id   BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  interview_type             interview_type NOT NULL,
  interview_scheduled_at     TIMESTAMPTZ NOT NULL,
  interview_location         VARCHAR(255),
  interview_notes            TEXT,
  interview_outcome          interview_outcome NOT NULL DEFAULT 'PENDING',

  interview_created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interview_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interviews_application_date
  ON interviews (interview_application_id, interview_scheduled_at);


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

CREATE TABLE application_tasks (
  application_task_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_task_application_id   BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  application_task_type             task_type NOT NULL,
  application_task_title            VARCHAR(255) NOT NULL,
  application_task_description      TEXT,

  application_task_due_at           TIMESTAMPTZ NOT NULL,
  application_task_completed_at     TIMESTAMPTZ,

  application_task_created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application_task_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_tasks_application_due
  ON application_tasks (application_task_application_id, application_task_due_at);

CREATE INDEX idx_application_tasks_due_completed
  ON application_tasks (application_task_due_at, application_task_completed_at);

CREATE TABLE saved_views (
  saved_view_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  saved_view_user_id     BIGINT NOT NULL
    REFERENCES users(user_id) ON DELETE CASCADE,

  saved_view_name        VARCHAR(255) NOT NULL,
  saved_view_is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  saved_view_filters_json JSONB NOT NULL,

  saved_view_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_view_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_saved_views_user_name
  ON saved_views (saved_view_user_id, saved_view_name);

CREATE TABLE cv_base (
  cv_base_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cv_base_user_id     BIGINT NOT NULL UNIQUE
    REFERENCES users(user_id) ON DELETE CASCADE,

  cv_base_location    VARCHAR(1024) NOT NULL,  -- R2 URL or object key
  cv_base_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE job_descriptions (
  job_description_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_description_application_id BIGINT NOT NULL UNIQUE
    REFERENCES applications(application_id) ON DELETE CASCADE,

  job_description_text           TEXT NOT NULL,
  job_description_fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE application_cvs (
  application_cv_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_cv_application_id BIGINT NOT NULL
    REFERENCES applications(application_id) ON DELETE CASCADE,

  application_cv_version        INTEGER NOT NULL,
  application_cv_location       VARCHAR(1024) NOT NULL, -- R2 URL or object key
  application_cv_tone           VARCHAR(50),
  application_cv_created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_application_cvs_version
    UNIQUE (application_cv_application_id, application_cv_version)
);

CREATE INDEX idx_application_cvs_application
  ON application_cvs (application_cv_application_id);