## `2026-10-02` — Apply renewal and subscription lifecycle events

**Type:** `feature`
**Branch:** `t3code/implement-sub-issue-99`
**Status:** `🔄 In Progress`

### Problem / Goal

Renewal webhooks reread the initial Checkout invoice, leaving paid access tied to the first week. Users need current paid periods, immediate Limited Access after payment failure, and restored access after a successful retry.

### Solution

Reconcile the subscription's latest invoice through the existing signed, transactional webhook boundary. Keep Stripe authoritative on delayed delivery and use the controllable billing clock for paid-period checks.

### What Changed

- Read the latest subscription invoice rather than the initial Checkout invoice.
- Verify renewals, cancellation boundaries, failures, retry recovery, duplicate delivery, delayed events, and outage redelivery through HTTP with PostgreSQL and fake Stripe responses.
- Document the Stripe custom retry intervals for days 1 and 3 and cancellation after exhausted retries; Dashboard configuration remains a deployment step.
- Verify the existing app entitlement refresh tests for changing paid actions and preserving saved work.

### Impact

Existing sessions follow subscription payment and period changes without requiring another sign-in.
