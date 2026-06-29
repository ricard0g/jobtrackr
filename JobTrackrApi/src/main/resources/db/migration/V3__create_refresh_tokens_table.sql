CREATE TABLE refresh_tokens (
    refresh_token_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refresh_token_user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    refresh_token_hash         VARCHAR(64) NOT NULL,
    refresh_token_family_id    UUID NOT NULL,
    refresh_token_expires_at   TIMESTAMPTZ NOT NULL,
    refresh_token_revoked_at   TIMESTAMPTZ,
    refresh_token_replaced_by_id UUID REFERENCES refresh_tokens(refresh_token_id),
    refresh_token_created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT refresh_tokens_hash_unique UNIQUE (refresh_token_hash)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(refresh_token_user_id);
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens(refresh_token_family_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(refresh_token_expires_at);
