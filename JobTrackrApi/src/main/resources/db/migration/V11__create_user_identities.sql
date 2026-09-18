CREATE TABLE user_identities (
    identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    identity_provider VARCHAR(32) NOT NULL,
    identity_subject VARCHAR(255) NOT NULL,
    identity_provider_email CITEXT NOT NULL,
    identity_linked_at TIMESTAMPTZ NOT NULL,
    identity_last_used_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT user_identities_provider_google CHECK (identity_provider = 'GOOGLE'),
    CONSTRAINT user_identities_subject_length CHECK (
        CHAR_LENGTH(identity_subject) BETWEEN 1 AND 255
    ),
    CONSTRAINT user_identities_provider_email_not_blank CHECK (
        LENGTH(TRIM(identity_provider_email::TEXT)) > 3
    )
);

CREATE UNIQUE INDEX uk_user_identities_provider_subject
    ON user_identities (identity_provider, identity_subject);

CREATE UNIQUE INDEX uk_user_identities_user_provider
    ON user_identities (identity_user_id, identity_provider);
