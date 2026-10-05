# Resubscribe from the existing User

A former subscriber signs in and opens Account Settings. When the linked Billing Customer has no remaining live subscription, **Resubscribe** starts the weekly Stripe Checkout with that existing Customer. Applications, Base CVs, Generated CVs, and Sign-in Identities stay with the same User.

## HTTP boundary

- `GET /api/v1/billing/subscription` requires authentication and returns `canResubscribe` without caching.
- `POST /api/v1/billing/resubscribe` requires authentication and a UUID `Idempotency-Key`. The server derives the Billing Customer from the signed-in User; callers cannot supply another customer or email.
- The Customer row is locked while reserving Checkout. A partial unique index also permits only one pending, open, or paid returning Checkout per User. Distinct concurrent attempts return `409 SUBSCRIPTION_ALREADY_EXISTS`; a safe retry with the same key returns the same Checkout.
- Active subscriptions, including payment-retry states, block another subscription. Canceling renewal alone does not enable resubscription before the existing subscription ends.
- Expired Checkout reservations are released after Stripe confirms expiry, including when the expiry webhook is delayed. Expired or ended saved keys return `CHECKOUT_EXPIRED`, and the app retries once with a fresh key. An uncertain pending request outside Stripe's safe idempotency window remains blocked for operator investigation.
- Returning Checkout cannot be retrieved through the public first-time Checkout endpoint and never creates a Registration Claim. Verified events must match the reserved Stripe Customer.

Stripe receives the existing `customer` and `customer_update[address]=auto` to support automatic tax. See the [Checkout creation API](https://docs.stripe.com/api/checkout/sessions/create) for these provider parameters.

## Return and payment confirmation

Set `JOBTRACKR_PUBLIC_ORIGIN` to the customer app's public origin. Resubscription returns to `/settings/account?resubscribe=returned` after Checkout, or `/settings/account` when canceled. It does not return to the landing's first-time registration flow.

The return URL grants no access. Account Settings shows a waiting message until the existing entitlement refresh reads a verified paid period. Signed webhooks reconcile the new subscription and payment against the original Billing Customer, restoring paid actions for existing sessions without creating a User or changing ownership of saved work.

## Verification

The HTTP integration suite uses real authentication, Flyway, PostgreSQL, and a fake Stripe HTTP boundary. It covers signing in after cancellation, Customer reuse, retained Applications and Base CVs, verified payment restoration, a second cancellation/resubscription cycle, active/retrying refusal, concurrent attempts, anonymous requests, Customer mismatch, and expired Checkout recovery. React Router tests cover canceled, active, waiting, paid-again, outage, and stale-key states.

For a Stripe test-mode smoke check, buy and register, cancel the subscription, sign into the existing User, and choose Resubscribe. Confirm the Stripe Customer ID is unchanged, the return opens Account Settings, paid actions remain unavailable until webhook confirmation, and saved Applications and documents remain accessible.
