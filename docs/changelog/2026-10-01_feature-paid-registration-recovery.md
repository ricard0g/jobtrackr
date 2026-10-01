# Recover an unclaimed paid registration (#95)

Buyers who left Checkout can request a registration link at their Checkout Email from `/auth/register`.
The API acknowledges eligible and ineligible requests identically and sends email in the background,
without exposing purchase lookup or delivery failures in the HTTP response.

Recovery reuses the existing hashed verification tokens, paid eligibility checks, and atomic claim
consumption. Checkout Email remains fixed, links expire within 30 minutes and never outlive paid access,
and registration preserves the original paid week. Expired Buyers are directed to purchase again.

HTTP integration and UI tests cover delivery, expiry, replacement, replay, failed delivery, and responses
that do not disclose eligibility. See [the recovery guide](../paid-registration-recovery.md).
