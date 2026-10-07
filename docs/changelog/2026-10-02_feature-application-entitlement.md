## `2026-10-02` — Expose current access and gate new Applications

**Type:** `feature`
**Branch:** `feature/jobtrackr-landing-stripe-setup`
**Status:** `🔄 In Progress`

### Problem / Goal

Issue #96 requires paid access to control new Application creation, including when a User already has a valid session. Limited Access must preserve sign-in and existing work.

### Solution

The API reads durable billing state on each entitlement and creation request. An active subscription requires a confirmed payment matching its current period, with an inclusive start and exclusive end. Cancellation scheduled for period end keeps the subscription active through the paid week; failed or ended subscriptions are limited.

### What Changed

- Added authenticated, uncached `GET /api/v1/user/entitlement` with access state, Application creation capability, and the current paid period end.
- Gated `POST /api/v1/applications` with a `403 PAID_ACCESS_REQUIRED` response while retaining existing reads, edits, and authentication.
- Displayed Paid access or Limited Access and disabled new Application buttons while limited.
- Refreshed only entitlement loader data on focus, visibility changes, every 30 seconds while visible, and at a nearby paid period end, preserving unsaved Application and Interview edits.
- Added PostgreSQL/Spring HTTP and React Router tests for period boundaries, existing-session changes, payment outcomes, and UI updates.

### Impact

Users can see their current access and keep working on existing Applications after paid access ends. Billing webhook reconciliation and the other paid-only actions remain covered by their separate sub-issues.
