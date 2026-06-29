CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TEMP TABLE user_id_migration (
    old_user_id BIGINT PRIMARY KEY,
    new_user_id UUID NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO user_id_migration (old_user_id, new_user_id)
SELECT user_id, gen_random_uuid()
FROM users;

ALTER TABLE cv_base DROP CONSTRAINT IF EXISTS cv_base_cv_base_user_id_fkey;
ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_saved_view_user_id_fkey;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_application_user_id_fkey;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_company_user_id_fkey;

ALTER TABLE users ADD COLUMN user_id_uuid UUID;

UPDATE users
SET user_id_uuid = user_id_migration.new_user_id
FROM user_id_migration
WHERE users.user_id = user_id_migration.old_user_id;

ALTER TABLE users ALTER COLUMN user_id_uuid SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users DROP COLUMN user_id;
ALTER TABLE users RENAME COLUMN user_id_uuid TO user_id;
ALTER TABLE users ALTER COLUMN user_id SET DEFAULT gen_random_uuid();
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);

ALTER TABLE users ALTER COLUMN user_email TYPE CITEXT USING user_email::citext;
ALTER TABLE users ADD COLUMN user_email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN user_password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN user_display_name VARCHAR(160);
ALTER TABLE users ADD COLUMN user_picture_url TEXT;
ALTER TABLE users ADD COLUMN user_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN user_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN user_deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN user_password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN user_last_login_at TIMESTAMPTZ;

UPDATE users
SET user_display_name = NULLIF(TRIM(CONCAT_WS(' ', user_first_name, user_last_name)), '');

ALTER TABLE users DROP COLUMN user_first_name;
ALTER TABLE users DROP COLUMN user_last_name;
ALTER TABLE users ADD CONSTRAINT users_user_email_not_blank CHECK (LENGTH(TRIM(user_email::TEXT)) > 3);

CREATE INDEX idx_users_user_enabled ON users(user_enabled);
CREATE INDEX idx_users_user_deleted_at ON users(user_deleted_at);

ALTER TABLE companies ADD COLUMN company_user_id_uuid UUID;

UPDATE companies
SET company_user_id_uuid = user_id_migration.new_user_id
FROM user_id_migration
WHERE companies.company_user_id = user_id_migration.old_user_id;

ALTER TABLE companies ALTER COLUMN company_user_id_uuid SET NOT NULL;
ALTER TABLE companies DROP CONSTRAINT companies_company_user_id_company_name_key;
ALTER TABLE companies DROP COLUMN company_user_id;
ALTER TABLE companies RENAME COLUMN company_user_id_uuid TO company_user_id;
ALTER TABLE companies ADD CONSTRAINT companies_company_user_id_company_name_key UNIQUE (company_user_id, company_name);
ALTER TABLE companies ADD CONSTRAINT companies_company_user_id_fkey
    FOREIGN KEY (company_user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE applications ADD COLUMN application_user_id_uuid UUID;

UPDATE applications
SET application_user_id_uuid = user_id_migration.new_user_id
FROM user_id_migration
WHERE applications.application_user_id = user_id_migration.old_user_id;

ALTER TABLE applications ALTER COLUMN application_user_id_uuid SET NOT NULL;
DROP INDEX IF EXISTS idx_applications_user_status;
ALTER TABLE applications DROP COLUMN application_user_id;
ALTER TABLE applications RENAME COLUMN application_user_id_uuid TO application_user_id;
CREATE INDEX idx_applications_user_status ON applications(application_user_id, application_status);
ALTER TABLE applications ADD CONSTRAINT applications_application_user_id_fkey
    FOREIGN KEY (application_user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE saved_views ADD COLUMN saved_view_user_id_uuid UUID;

UPDATE saved_views
SET saved_view_user_id_uuid = user_id_migration.new_user_id
FROM user_id_migration
WHERE saved_views.saved_view_user_id = user_id_migration.old_user_id;

ALTER TABLE saved_views ALTER COLUMN saved_view_user_id_uuid SET NOT NULL;
DROP INDEX IF EXISTS idx_saved_views_user_name;
ALTER TABLE saved_views DROP COLUMN saved_view_user_id;
ALTER TABLE saved_views RENAME COLUMN saved_view_user_id_uuid TO saved_view_user_id;
CREATE UNIQUE INDEX idx_saved_views_user_name ON saved_views(saved_view_user_id, saved_view_name);
ALTER TABLE saved_views ADD CONSTRAINT saved_views_saved_view_user_id_fkey
    FOREIGN KEY (saved_view_user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE cv_base ADD COLUMN cv_base_user_id_uuid UUID;

UPDATE cv_base
SET cv_base_user_id_uuid = user_id_migration.new_user_id
FROM user_id_migration
WHERE cv_base.cv_base_user_id = user_id_migration.old_user_id;

ALTER TABLE cv_base ALTER COLUMN cv_base_user_id_uuid SET NOT NULL;
ALTER TABLE cv_base DROP CONSTRAINT cv_base_cv_base_user_id_key;
ALTER TABLE cv_base DROP COLUMN cv_base_user_id;
ALTER TABLE cv_base RENAME COLUMN cv_base_user_id_uuid TO cv_base_user_id;
ALTER TABLE cv_base ADD CONSTRAINT cv_base_cv_base_user_id_key UNIQUE (cv_base_user_id);
ALTER TABLE cv_base ADD CONSTRAINT cv_base_cv_base_user_id_fkey
    FOREIGN KEY (cv_base_user_id) REFERENCES users(user_id) ON DELETE CASCADE;
