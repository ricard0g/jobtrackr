## `2026-10-01` — Register a paid Buyer with Google Sign-In

**Type:** `feature`
**Branch:** `main`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Implements #94. Paid Buyers could register only with a password. Google Sign-In also created a User for any
unknown Google identity, bypassing the paid Registration Claim.

### Solution

A Checkout or email-link token starts a claim-bound `REGISTER_GOOGLE` OAuth flow. The callback requires Google's
verified email to equal the Checkout Email. It then atomically creates the User and Google identity, consumes
the claim, links the Billing Customer, and issues the normal session. Ordinary Google sign-in no longer creates
Users.

### What Changed

- `GET /api/v1/auth/registration/claim` and `POST /api/v1/auth/registration/google`
- New `oauthResult` codes: `not_registered`, `registration_used`, `registration_expired`
- React registration offers Google with registration-specific mismatch, conflict, and expiry messages
- Landing payment page focuses on one action: sending the registration email
- HTTP tests with a fake Google OIDC server cover claims, identities, collisions, replay, and races

### Impact

Buyers can register with either supported Sign-in Identity, and every new User now comes from a paid claim.
See [Paid Google registration](../paid-google-registration.md).
