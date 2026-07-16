DROP TABLE cv_base;

CREATE TABLE base_cvs (
  base_cv_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  base_cv_user_id UUID NOT NULL
    REFERENCES users(user_id) ON DELETE RESTRICT,
  base_cv_object_key VARCHAR(512) NOT NULL,
  base_cv_original_filename VARCHAR(255) NOT NULL,
  base_cv_format VARCHAR(16) NOT NULL,
  base_cv_content_type VARCHAR(128) NOT NULL,
  base_cv_byte_size BIGINT NOT NULL,
  base_cv_sha256 CHAR(64) NOT NULL,
  base_cv_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_base_cvs_object_key UNIQUE (base_cv_object_key),
  CONSTRAINT uq_base_cvs_user_sha256 UNIQUE (base_cv_user_id, base_cv_sha256),
  CONSTRAINT ck_base_cvs_format CHECK (base_cv_format IN ('PDF', 'DOCX', 'MARKDOWN')),
  CONSTRAINT ck_base_cvs_byte_size CHECK (base_cv_byte_size > 0 AND base_cv_byte_size <= 10485760),
  CONSTRAINT ck_base_cvs_sha256 CHECK (base_cv_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_base_cvs_user_created_at
  ON base_cvs (base_cv_user_id, base_cv_created_at DESC);
