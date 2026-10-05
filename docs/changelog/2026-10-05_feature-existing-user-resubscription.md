## `2026-10-05` — Resubscribe from the existing User

**Type:** `feature`
**Branch:** `t3code/implement-sub-issue-100`
**Status:** `✅ Complete`

### Problem / Goal

Former subscribers need to buy another paid week without registering again or losing their Applications and documents.

### What Changed

- Add authenticated Checkout using the User's existing Billing Customer and a return to Account Settings.
- Reserve returning Checkout durably, reject live subscriptions and racing attempts, and recover expired or ended attempts safely.
- Restore paid access through verified payment events without creating a Registration Claim or another User.
- Add HTTP and React Router coverage for cancellation, payment restoration, Customer reuse, retained work, duplicate prevention, and retry behavior.
- Confirm before Checkout when Profile edits are unsaved, and refresh resubscription eligibility alongside entitlement checks while Account Settings stays open.
