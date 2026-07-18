-- AI-processing consent on users
ALTER TABLE users
    ADD COLUMN user_ai_consent_version VARCHAR(32),
    ADD COLUMN user_ai_consent_at TIMESTAMPTZ;

ALTER TABLE job_descriptions
    ADD COLUMN job_description_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Remodel application_cvs as immutable successful R2 artifacts.
-- Pre-feature rows only stored opaque locations and are not downloadable.
DELETE FROM application_cvs;

ALTER TABLE application_cvs
    DROP COLUMN application_cv_tone,
    DROP COLUMN application_cv_location;

ALTER TABLE application_cvs
    ADD COLUMN application_cv_object_key VARCHAR(512) NOT NULL,
    ADD COLUMN application_cv_original_filename VARCHAR(255) NOT NULL,
    ADD COLUMN application_cv_format VARCHAR(16) NOT NULL,
    ADD COLUMN application_cv_content_type VARCHAR(128) NOT NULL,
    ADD COLUMN application_cv_byte_size BIGINT NOT NULL,
    ADD COLUMN application_cv_sha256 CHAR(64) NOT NULL;

ALTER TABLE application_cvs
    ADD CONSTRAINT application_cvs_format_check
        CHECK (application_cv_format IN ('PDF', 'DOCX', 'MARKDOWN')),
    ADD CONSTRAINT application_cvs_byte_size_positive
        CHECK (application_cv_byte_size > 0),
    ADD CONSTRAINT application_cvs_object_key_unique UNIQUE (application_cv_object_key);

-- Durable generation queue / history
CREATE TABLE cv_generations (
    cv_generation_id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cv_generation_user_id               UUID NOT NULL
        REFERENCES users(user_id) ON DELETE CASCADE,
    cv_generation_application_id        BIGINT NOT NULL
        REFERENCES applications(application_id) ON DELETE CASCADE,
    cv_generation_base_cv_id            BIGINT
        REFERENCES base_cvs(base_cv_id) ON DELETE SET NULL,

    cv_generation_idempotency_key       VARCHAR(128) NOT NULL,
    cv_generation_requested_format      VARCHAR(16) NOT NULL,
    cv_generation_job_description_snapshot TEXT NOT NULL,
    cv_generation_additional_info_snapshot TEXT,

    cv_generation_status                VARCHAR(32) NOT NULL,
    cv_generation_attempt_count         INTEGER NOT NULL DEFAULT 0,
    cv_generation_max_attempts          INTEGER NOT NULL DEFAULT 3,
    cv_generation_lease_owner           VARCHAR(128),
    cv_generation_lease_expires_at      TIMESTAMPTZ,
    cv_generation_next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    cv_generation_error_code            VARCHAR(64),
    cv_generation_error_message         VARCHAR(512),
    cv_generation_correlation_id        UUID NOT NULL,

    cv_generation_model_id              VARCHAR(128),
    cv_generation_workflow_version      VARCHAR(64),
    cv_generation_consent_version       VARCHAR(32) NOT NULL,

    cv_generation_application_cv_id     BIGINT
        REFERENCES application_cvs(application_cv_id) ON DELETE SET NULL,

    cv_generation_created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cv_generation_updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cv_generation_started_at            TIMESTAMPTZ,
    cv_generation_completed_at          TIMESTAMPTZ,

    CONSTRAINT cv_generations_format_check
        CHECK (cv_generation_requested_format IN ('PDF', 'DOCX', 'MARKDOWN')),
    CONSTRAINT cv_generations_status_check
        CHECK (cv_generation_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT uq_cv_generations_user_idempotency
        UNIQUE (cv_generation_user_id, cv_generation_idempotency_key)
);

CREATE INDEX idx_cv_generations_application
    ON cv_generations (cv_generation_application_id, cv_generation_created_at DESC);

CREATE INDEX idx_cv_generations_user
    ON cv_generations (cv_generation_user_id, cv_generation_created_at DESC);

CREATE INDEX idx_cv_generations_claim
    ON cv_generations (cv_generation_status, cv_generation_next_attempt_at, cv_generation_lease_expires_at);

CREATE INDEX idx_cv_generations_base_cv_active
    ON cv_generations (cv_generation_base_cv_id)
    WHERE cv_generation_status IN ('PENDING', 'PROCESSING');

CREATE INDEX idx_cv_generations_terminal_purge
    ON cv_generations (cv_generation_status, cv_generation_completed_at)
    WHERE cv_generation_status IN ('FAILED', 'CANCELLED');

-- Link successful Application CV back to its generation (1:1)
ALTER TABLE application_cvs
    ADD COLUMN application_cv_generation_id BIGINT
        REFERENCES cv_generations(cv_generation_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_application_cvs_generation
    ON application_cvs (application_cv_generation_id)
    WHERE application_cv_generation_id IS NOT NULL;

-- Retryable R2 object cleanup outbox
CREATE TABLE storage_cleanup_jobs (
    storage_cleanup_job_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    storage_cleanup_object_key  VARCHAR(512) NOT NULL,
    storage_cleanup_attempts    INTEGER NOT NULL DEFAULT 0,
    storage_cleanup_next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    storage_cleanup_last_error  VARCHAR(256),
    storage_cleanup_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    storage_cleanup_completed_at TIMESTAMPTZ
);

CREATE INDEX idx_storage_cleanup_pending
    ON storage_cleanup_jobs (storage_cleanup_next_attempt_at)
    WHERE storage_cleanup_completed_at IS NULL;
