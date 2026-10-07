-- Seed one paid, email-verified Registration Claim so the smoke can register without Stripe.
-- Requires psql variables: email, token (the raw verification token sent as verificationToken).
WITH customer AS (
    INSERT INTO billing_customers (id, checkout_email, stripe_customer_id)
    VALUES (gen_random_uuid(), :'email', 'cus_smoke_' || gen_random_uuid())
    RETURNING id, checkout_email
), checkout AS (
    INSERT INTO billing_checkouts (id, customer_id, checkout_email, return_token, stripe_session_id, state)
    SELECT gen_random_uuid(), id, checkout_email, gen_random_uuid()::text, 'cs_smoke_' || gen_random_uuid(), 'PAID'
    FROM customer
    RETURNING id, customer_id
), subscription AS (
    INSERT INTO billing_subscriptions (stripe_subscription_id, customer_id, checkout_id, status, period_start, period_end)
    SELECT 'sub_smoke_' || gen_random_uuid(), customer_id, id, 'active',
        now() - interval '1 minute', now() + interval '7 days'
    FROM checkout
), payment AS (
    INSERT INTO billing_payments (stripe_invoice_id, checkout_id, outcome, period_start, period_end)
    SELECT 'in_smoke_' || gen_random_uuid(), id, 'paid', now() - interval '1 minute', now() + interval '7 days'
    FROM checkout
), claim AS (
    INSERT INTO registration_claims (id, checkout_id, paid_period_start, expires_at)
    SELECT gen_random_uuid(), id, now() - interval '1 minute', now() + interval '1 day'
    FROM checkout
    RETURNING id
)
INSERT INTO registration_email_verifications (token_hash, claim_id, checkout_email, expires_at)
SELECT encode(sha256(convert_to(:'token', 'UTF8')), 'hex'), id, :'email', now() + interval '1 hour'
FROM claim;
