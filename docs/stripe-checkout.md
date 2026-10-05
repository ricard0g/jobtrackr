# Stripe hosted Checkout

The pricing card's Subscribe button calls Spring and immediately redirects to Stripe. Stripe collects the Checkout Email, address, and payment details. The landing has no payment or email-entry page and holds no Stripe secret or publishable key.

## Configure test mode

Fill these entries in root `.env` (host development), `.env.compose` (full Compose), or `.env.vps` (VPS):

```dotenv
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_WEEKLY_PRICE_ID=price_...
STRIPE_LANDING_ORIGIN=http://localhost:4321
```

Create a recurring Price for JobTrackr with EUR 1099 cents, interval `week`, interval count 1, and `tax_behavior=inclusive`. Spring checks these properties before creating each Checkout. Configure Stripe Tax, the business address, product tax code, and applicable registrations; Checkout enables automatic tax. Cards and their supported wallets are the only enabled payment methods. Configure [Stripe's one-subscription redirection](https://docs.stripe.com/payments/checkout/limit-subscriptions) in Checkout settings, keeping the required customer portal login link enabled.

Set `PUBLIC_API_ORIGIN=http://localhost:8080` in `jobtrackr-landing/.env` for local development. The production build defaults to `https://app.jobtrakcr.com`. Set `STRIPE_LANDING_ORIGIN=https://jobtrakcr.com` on the production backend, and include the landing origin in `CORS_ALLOWED_ORIGINS`. The landing remains a static Astro site. Compose forwards all Stripe settings only to the backend.

Start the API with the repo's host-development workflow and start Astro with `npm run dev` in `jobtrackr-landing`. Then run:

```bash
stripe login
stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_failed,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,refund.updated,refund.failed --forward-to localhost:8080/api/v1/billing/webhook
```

Copy the listener's signing secret to `STRIPE_WEBHOOK_SECRET`, restart Spring, and buy through the actual landing CTA with a Stripe test card. Synthetic `stripe trigger` events for unrelated sessions do not grant a claim. For deployment, register `https://app.jobtrakcr.com/api/v1/billing/webhook` with these events and API version `2026-08-26.dahlia` (stripe-java 33.4.2). Use that endpoint's signing secret rather than the local listener secret. See [Stripe's webhook setup](https://docs.stripe.com/webhooks).

## Payment boundary

`POST /api/v1/billing/checkouts` accepts no email or price from the browser. An `Idempotency-Key` UUID identifies a durable anonymous Checkout reservation before Spring calls Stripe. The landing retains it in session storage, disables the button while opening Checkout, and reuses the reservation after a network error. Stripe uses the same stable server-generated idempotency key for concurrent requests. Uncertain reservations older than 23 hours fail closed rather than recreating a payment after Stripe's idempotency retention window.

Stripe creates the Billing Customer during hosted Checkout. A signed webhook resolves the stored reservation, retrieves Stripe's authoritative Session, Subscription, and latest Invoice, then records the Billing Customer, Checkout Email, subscription, payment outcome, event ID, and Registration Claim in PostgreSQL. The first paid week uses the initial invoice's line period; renewal uses the latest invoice's period. A later webhook or browser redirect cannot restart either period. See [subscription lifecycle and retry configuration](subscription-lifecycle.md). Event records commit with their effects; a Stripe outage rolls back ordinary processing so delivery can be retried.

One active purchase per Billing Customer and case-insensitive Checkout Email is enforced using PostgreSQL email locks and unique indexes. Stripe's hosted subscription limit handles existing subscribers. If independent purchases race past that protection, Spring records a duplicate decision durably, issues no second Registration Claim, cancels the duplicate subscription without proration, and refunds its initial payment. That reversal is retryable even after partial Stripe success or a process restart. Pending refunds remain pending in PostgreSQL; `refund.updated` and `refund.failed` reconcile their eventual outcome, including a refund that initially succeeded and later failed. No live Stripe operation is performed by the automated tests.

The success URL returns to `/checkout-return/` with a private status token in its URL fragment, which is removed before checking status and retained only in session storage. `GET /api/v1/billing/checkouts/status` uses `X-Checkout-Token` and returns a non-cacheable eligibility/paid-period response. Its `duplicate` flag is true when the purchase matched an existing paid Checkout Email or Billing Customer and is being cancelled and refunded; the return page then explains the refund and links to sign in instead of polling. A Checkout URL, Session ID, return redirect, or token alone cannot create a User, authenticate a session, or consume a claim. The return page offers a Resend verification link for [paid password registration](paid-password-registration.md) (#93). [Paid Google registration](paid-google-registration.md) starts from that email link; [registration recovery](paid-registration-recovery.md) lets Buyers resume without the Checkout return token.

Run the real PostgreSQL/fake Stripe HTTP tests with:

```bash
cd JobTrackrApi
./mvnw test -Dtest=CheckoutIntegrationTest
```

The credentials remain blank and Checkout disabled in committed templates. Complete the existing seller/policy launch requirements before enabling live payments.

## Account Settings billing management

Configure a [Stripe Customer Portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create)
with payment method updates, invoice history, and subscription cancellation enabled. Set cancellation mode to
`at_period_end`. Put its `bpc_...` ID in `STRIPE_PORTAL_CONFIGURATION_ID` and set `STRIPE_APP_ORIGIN` to
`http://localhost:5173` for host development or `https://app.jobtrakcr.com` in production. Full Compose development
may use `http://localhost:18080`. The configuration ID must belong to the same Stripe mode as the secret key.
Spring validates these portal features before creating each session and rejects immediate cancellation settings.

Account Settings exposes **Manage billing** without a separate billing tab. Its authenticated
`POST /api/v1/billing/portal` action resolves the Billing Customer from the signed-in User, including Users with
Limited Access. Customer IDs and return destinations supplied by clients cannot select a different customer or
return path. Missing linked customers return `BILLING_CUSTOMER_MISSING`; Stripe failures or an absent/unsafe portal
configuration return `BILLING_UNAVAILABLE`. Portal session responses are not cached.

Stripe returns to `/settings/account` at the configured app origin. This full-page return runs the app loader again
and reads current durable billing capability state. Existing signed subscription webhooks and the periodic/focus
capability refresh handle cancellation updates that arrive after the return. A redirect itself never changes access.

For a test-mode smoke check, sign in after a paid registration, open Manage billing, inspect invoices and update a
payment method, then cancel renewal. Return to Account Settings and verify paid features remain available until the
paid period ends. Verify Limited Access Users can still open the portal. Run the fake Stripe HTTP coverage with
`./mvnw test -Dtest=RenewalIntegrationTest` and the route coverage with
`npm test -- src/routes/AccountSettingsRoute.test.tsx` in `jobtrackr-web`.
