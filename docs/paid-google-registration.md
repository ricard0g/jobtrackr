# Paid Google registration

A paid Buyer can register with Google Sign-In instead of a password. Google's verified email must exactly match the
Checkout Email (case-insensitive). The new User gets that email as its Primary Email, one Google Sign-in Identity,
and the existing Billing Customer. Registration consumes the same one-time Registration Claim as
[password registration](paid-password-registration.md).

## Entry points

- The registration email link (`#verify=`) shows the password form and **Continue with Google** when Google is
  enabled. The landing payment page offers only **Send my registration email**, so the email is the one next step.
- `/auth/register#checkout=<Checkout token>` also offers Google, without a password form, because a password
  requires the email-ownership link. The landing doesn't link to it.

The SPA keeps either token in tab storage.

## HTTP boundary

- `GET /api/v1/auth/registration/claim` with `X-Checkout-Token` returns the fixed Checkout Email and paid-period end
  for an eligible claim; otherwise 403. It does not consume the claim.
- `POST /api/v1/auth/registration/google` with exactly one of `X-Checkout-Token` or `X-Verification-Token` and the
  CSRF header checks claim eligibility. It then replaces the OAuth session with a five-minute `REGISTER_GOOGLE`
  purpose bound to the claim ID, not the token. It returns 204, uses the registration IP rate limit, and returns 503
  while Google is disabled.
- The browser then opens `/api/v1/auth/oauth2/authorization/google?screen=register`. A start without
  `screen=register` replaces the pending registration with ordinary sign-in.

The callback rechecks the claim under the Checkout and Billing Customer locks. In one transaction, it creates the
User and Google identity, consumes the claim, links the Billing Customer, and issues the normal refresh-cookie
session. It then redirects to `/`. Failures redirect to `/auth/register?oauthResult=…`:

| Result | Meaning |
| --- | --- |
| `mismatch` | Google's verified email differs from the Checkout Email; the claim remains available |
| `registration_used` | The claim was already consumed by a registration (replay) |
| `registration_expired` | The paid week ended or the payment is no longer current |
| `conflict` | A User already has the email, or the Google subject already belongs to a User; nothing is linked |
| `failed` | Google omitted a subject or verified email |
| `expired` | The OAuth handshake expired or was replaced |

An unknown Google identity can no longer create a User through ordinary sign-in. It returns `not_registered`, or
`conflict` if its email belongs to an existing User. Existing Identity Link rules are unchanged.

## Verification

`PaidGoogleRegistrationIntegrationTest` runs real Spring security and PostgreSQL/Flyway. It fakes Stripe and
uses a local fake Google OIDC server. It covers success through both tokens, mismatch, unverified email, replay,
paid-week expiry between start and callback, unpaid/unknown tokens, closed just-in-time signup, replacement by
ordinary sign-in, both collision types, and racing callbacks. React Router tests cover the Google registration
UI.
