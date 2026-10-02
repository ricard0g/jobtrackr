# Weekly subscription lifecycle

Verified events reconcile Stripe's current Checkout Session, Subscription and latest Invoice into PostgreSQL. The latest invoice's subscription line supplies the paid period. A delayed event is a prompt to retrieve current Stripe state, so an old failure cannot undo a paid retry or renewal. Event IDs and billing changes commit together; duplicates do not repeat effects, and a failed Stripe read rolls back processing so Stripe can redeliver.

Checkout completion follows the original Session payment status; a failed renewal does not reopen a completed Checkout or remove its protection against another active purchase. Duplicate reversal retains the initial invoice and its period independently of the latest invoice, and records refund outcomes against that initial invoice only.

Each paid-only HTTP request checks the durable period and confirmed payment with the billing clock. Existing sessions stay signed in during Limited Access. The app refreshes entitlement every 30 seconds while visible, on focus, and at an approaching paid-period expiry; paid-action failures also refresh it. Existing Applications and Generated CVs remain available.

| Stripe state | JobTrackr access |
| --- | --- |
| Active, current invoice paid, inside its period | Paid access |
| Active, renewal canceled at period end | Paid access until the paid period ends |
| Current renewal invoice unpaid or subscription past due | Limited Access immediately after webhook reconciliation |
| Retry paid and subscription active | Paid access for that invoice's period |
| Subscription canceled after exhausted retries, or paid period expired | Limited Access |

## Configure retries in Stripe

These settings belong to the Stripe account, not application environment variables. Apply them separately in the test/sandbox and live Dashboard. Repository changes do not apply or verify account settings.

1. Open **Billing → Revenue recovery → Retries → Cards**.
2. Disable Smart Retries and choose a custom schedule with **two retries**.
3. Set the first retry to **1 day after the initial failed attempt**.
4. Set the second retry to **2 days after the previous attempt**, reaching **day 3 after the initial failure**. Remove any third retry.
5. Set the action after all retries fail to **Cancel the subscription**, and save.
6. Ensure any account recovery Automations use the same schedule and terminal cancellation action.
7. Configure Customer Portal cancellation for **the end of the billing period**.

Stripe's [retry documentation](https://docs.stripe.com/billing/revenue-recovery/smart-retries) defines custom intervals relative to the previous attempt and describes the terminal cancellation setting. Stripe executes collection and cancellation; JobTrackr does not run a competing charge scheduler. Hard declines can prevent actual collection until the buyer provides a new payment method.

Enable `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and `customer.subscription.deleted` on the existing `/api/v1/billing/webhook` destination, alongside the Checkout and duplicate-refund events in [Stripe Checkout setup](stripe-checkout.md). Stripe [does not guarantee event delivery order](https://docs.stripe.com/webhooks#event-ordering).

## Verify the account settings

Use a Stripe sandbox subscription and [Test Clock](https://docs.stripe.com/billing/testing/test-clocks) to advance through an initially paid week and a failing renewal. Confirm the first failure removes paid actions in an already signed-in session, the retry dates are day 1 and day 3, a paid retry restores access, and both failed retries end in a canceled subscription. Separately cancel renewal during a paid week and confirm access ends at the period boundary. Record the saved Dashboard settings and observed clock timeline before live rollout.

Automated tests use real PostgreSQL and signed webhook requests against fake Stripe HTTP responses, exercising the real Stripe gateway without live collection:

```bash
cd JobTrackrApi
./mvnw test -Dtest=RenewalIntegrationTest
cd ../jobtrackr-web
npm test -- src/routes/entitlement.test.tsx
```
