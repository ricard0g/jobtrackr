# Sell the first weekly subscription through hosted Stripe Checkout

Issue: [#92](https://github.com/ricard0g/jobtrackr/issues/92)

The landing pricing CTA now starts Checkout through Spring and redirects directly to Stripe, where the buyer supplies the Checkout Email and pays. Spring validates the EUR 10.99 inclusive weekly Price and verifies webhook signatures. PostgreSQL reservations, subscription/payment records, processed events, and expiring Registration Claims prevent redirects or retries from creating paid access on their own. No User is created by this flow.

Added fake Stripe/real PostgreSQL HTTP coverage for checkout requests, payment confirmation, replay, initial-period expiry, duplicate prevention, and retryable failure handling. Environment templates, Compose wiring, and [Stripe setup instructions](../stripe-checkout.md) cover local/test and deployed use. Registration is deferred to #93.

## Validation

- Full backend suite: 414 tests passed, including 12 billing HTTP tests using PostgreSQL and a fake Stripe boundary.
- Full landing suite: all 12 tests passed. Eight demo tests initially hit a stale Astro optimizer cache; they passed after restarting the existing dev server.
- Astro check: no errors, warnings, or hints. Production build passed.
- Live/test Stripe Checkout was not exercised because Stripe credentials remain blank. Local `.env` entries are prepared; enabling billing requires the secret key, webhook signing secret, weekly Price ID, and documented Stripe Tax/Checkout configuration.

Review fixed point: `83e243dd2ee72e57690ff159fa27d70613c1407f`.

## Standards

No remaining findings. Resolved shared state typing, guard naming, JDBC projection duplication, and formatting findings from the independent Standards review.

## Spec

No remaining findings. Resolved expired hosted-session recovery and truthful pending/failed duplicate-refund reconciliation from the independent Spec review. The pricing button opens hosted Stripe Checkout directly; Stripe collects the Checkout Email.

Final review: Standards 0 findings; Spec 0 findings.
