ALTER TABLE users
    ADD COLUMN user_auth_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
    ADD CONSTRAINT users_user_auth_version_non_negative CHECK (user_auth_version >= 0);
