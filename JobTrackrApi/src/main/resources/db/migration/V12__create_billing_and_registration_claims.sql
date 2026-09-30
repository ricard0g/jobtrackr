CREATE TABLE billing_customers (
    id UUID PRIMARY KEY,
    checkout_email CITEXT NOT NULL,
    stripe_customer_id TEXT UNIQUE,
    user_id UUID UNIQUE REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE billing_checkouts (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES billing_customers(id),
    checkout_email CITEXT,
    return_token TEXT NOT NULL UNIQUE,
    stripe_session_id TEXT UNIQUE,
    checkout_url TEXT,
    session_expires_at TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'OPEN', 'PAID', 'EXPIRED', 'ENDED', 'DUPLICATE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_one_purchase_per_customer ON billing_checkouts(customer_id)
    WHERE state = 'PAID';
CREATE UNIQUE INDEX billing_one_purchase_per_email ON billing_checkouts(checkout_email) WHERE state = 'PAID';

CREATE TABLE billing_subscriptions (
    stripe_subscription_id TEXT PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES billing_customers(id),
    checkout_id UUID NOT NULL UNIQUE REFERENCES billing_checkouts(id),
    status TEXT NOT NULL,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ
);

CREATE TABLE billing_payments (
    stripe_invoice_id TEXT PRIMARY KEY,
    checkout_id UUID NOT NULL REFERENCES billing_checkouts(id),
    outcome TEXT NOT NULL,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registration_claims (
    id UUID PRIMARY KEY,
    checkout_id UUID NOT NULL UNIQUE REFERENCES billing_checkouts(id),
    paid_period_start TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at > paid_period_start)
);

CREATE TABLE billing_events (
    stripe_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE billing_duplicates (
    checkout_id UUID PRIMARY KEY REFERENCES billing_checkouts(id),
    stripe_subscription_id TEXT NOT NULL,
    stripe_invoice_id TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE
);
