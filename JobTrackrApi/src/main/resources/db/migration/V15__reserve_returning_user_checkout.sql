ALTER TABLE billing_checkouts ADD COLUMN returning_user_id UUID REFERENCES users(user_id);

CREATE UNIQUE INDEX billing_one_checkout_per_returning_user ON billing_checkouts(returning_user_id)
    WHERE state IN ('PENDING', 'OPEN', 'PAID');
