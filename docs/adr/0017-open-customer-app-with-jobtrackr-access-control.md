# Open the customer app with JobTrackr access control

`https://app.jobtrakcr.com` will be reachable without Cloudflare Access so first-time buyers, returning Users, and Stripe webhooks can reach it; the public Astro landing lives at `https://jobtrakcr.com`. JobTrackr authentication and subscription entitlements will control application actions, while Cloudflare Access may remain on a private staging hostname. Keeping the current Access allowlist on production would require maintaining a second customer admission system alongside JobTrackr and Stripe.
