# Paid password registration

Implements #93: Buyers with a verified, currently paid Checkout can request a Resend email-ownership link,
create a password with the fixed Checkout Email, and enter JobTrackr with the normal session. Registration
atomically consumes the one-time claim and links the new User to the existing Billing Customer. Public
password signup without a verified paid claim is closed.

The landing payment return page requests email delivery; the React registration route explains the paid
step, keeps email read-only, and handles expired links. Backend-only Resend settings use
`no-reply@jobtrakcr.com` in all environment examples and Compose workflows. Deployment and HTTP behavior
are documented in [Paid password registration](../paid-password-registration.md).

Spring HTTP/PostgreSQL tests fake Stripe and Resend and cover permitted registration, replay, mismatch,
expiry, unpaid access, concurrency, delivery failure, and existing-User collisions. Existing authentication
fixtures now provide paid verification claims. A concurrent Google identity lookup eagerly fetches its
User to preserve the existing link behavior for verified password Users.
