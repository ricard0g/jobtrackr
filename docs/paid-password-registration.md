# Paid password registration

After Stripe confirms payment, the landing's `/checkout-return/` page offers **Send my registration email**.
Spring sends a link to the stored Checkout Email through Resend. Opening the link shows that email as read-only,
asks for a display name and password, and registers the Buyer with the normal access token and refresh cookie.
The paid week starts at Stripe billing and is not restarted by registration.

## Configuration

Keep secrets in the ignored root `.env`, `.env.compose`, or `.env.vps` file, using the matching example:

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=no-reply@jobtrakcr.com
JOBTRACKR_PUBLIC_ORIGIN=http://localhost:5173
```

Use `https://app.jobtrakcr.com` as `JOBTRACKR_PUBLIC_ORIGIN` in production, or the frontend's actual origin in
Compose/tunnel development. Verify `jobtrakcr.com` in Resend before sending from the configured address.
The API key belongs only on the backend; both Compose workflows forward it only to Spring.
Resend uses its [send-email API](https://resend.com/docs/api-reference/emails/send-email).
Existing Stripe and CORS configuration from [Stripe Checkout](stripe-checkout.md) is also required.

## HTTP boundary

- `POST /api/v1/auth/registration/verification` with `X-Checkout-Token` requests delivery. It accepts no email
  from the browser, returns 202, and uses the existing registration IP rate limit. Delivery failure returns 503
  and rolls back the token; the purchase remains available for another attempt.
- `GET /api/v1/auth/registration/verification` with `X-Verification-Token` returns the fixed Checkout Email
  and paid-period end after checking the link and current eligibility. It does not consume the claim.
- `POST /api/v1/auth/register` requires `email`, `password`, and `verificationToken`; `displayName` is optional.
  Email mismatch, absent/unknown/expired tokens, consumed claims, ended paid weeks, and unpaid purchases return 403.
  An email already belonging to a User returns 409 without linking or merging that User.

Verification links expire after at most 30 minutes and never outlive the original paid Registration Claim.
Only their SHA-256 hashes are stored. Links carry tokens in URL fragments; the SPA removes the fragment before
routing and retains the token in that tab's session storage until successful registration. Responses use no-store.
Requesting another link from the payment return page leaves previously delivered links valid until their expiry,
but successful registration consumes the one shared claim, invalidating every link for that purchase.

Registration locks the Checkout and Billing Customer in the same transaction as User creation, payment checks,
claim consumption, Billing Customer linking, and session issuance. Concurrent attempts produce one User session.
The new Primary Email is the normalized Checkout Email and is marked verified.

Google paid registration is #94. Email recovery without the Checkout return token is separate follow-up work.
This change closes public password signup and hides the password form until a valid email link is opened.

## Verification

`PaidRegistrationIntegrationTest` uses real Spring HTTP security and PostgreSQL/Flyway with fake Stripe and Resend
boundaries. It covers successful sessions, forbidden public signup, email mismatch, unpaid/unknown purchases,
expired links and paid weeks, payment failure after delivery, replay, concurrent registration, and delivery failure.
Existing authentication integration suites use paid verification fixtures. React Router tests cover the fixed email,
link errors, and successful form submission. No real email is sent by automated tests.
