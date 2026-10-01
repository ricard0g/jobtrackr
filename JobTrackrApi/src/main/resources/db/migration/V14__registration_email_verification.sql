CREATE TABLE registration_email_verifications (
    token_hash TEXT PRIMARY KEY,
    claim_id UUID NOT NULL REFERENCES registration_claims(id),
    checkout_email CITEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX registration_email_verifications_claim ON registration_email_verifications(claim_id);
