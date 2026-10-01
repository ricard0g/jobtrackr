# Recover an unclaimed paid registration

A Buyer who left Checkout can open `/auth/register` from the sign-in page and request a fresh link using
its Checkout Email. `POST /api/v1/auth/registration/recovery` accepts a JSON `{ "email": "buyer@example.com" }`.
Valid requests receive the same non-cacheable `202` acknowledgement for eligible, unknown, unpaid,
expired, and already claimed purchases. Input validation and the existing per-IP registration rate limit
apply regardless of eligibility.

Delivery runs on a bounded background executor so purchase lookup and email delivery do not affect the
public response. Eligibility is checked under the existing checkout/customer locks before storing and
sending a link. Only an active paid Subscription with an unconsumed Registration Claim and an unlinked
Billing Customer qualifies. Delivery failures roll back the token and produce a log without email or token
contents. Queued work is in memory; after a process interruption, the Buyer can request another link.

Recovery uses the same Resend-delivered verification link as paid password registration. Tokens are random,
stored as SHA-256 hashes, and expire within 30 minutes or at the original claim's paid-period end,
whichever comes first. Opening the link permits password registration or matching verified Google
registration. The fixed Checkout Email and paid-period end are shown on the form. Viewing a link does
not consume it; successful registration atomically consumes its claim, invalidating every link for that
claim and preventing replay. Current paid eligibility is checked again at registration.

An invalid, expired, or used link offers recovery and the weekly purchase link. If paid access ended before
registration, the Buyer must buy again; recovery creates no User and never restarts or extends the paid week.

HTTP integration tests fake Stripe and email delivery and cover recovery delivery, fixed email, unchanged
paid period, replay, link expiry, paid expiry, replacement links, generic responses, and failed/background
delivery. React Router UI tests cover the recovery acknowledgement, fixed-email registration, and rejected links.
