# Stripe and landing plan

This plan records the agreed product behavior for the public landing and paid launch. The design reference is `tmp/landing/`; the earlier architecture discussion is `tmp/stripe-setup-and-landing-page-cursor-thread.md`. Decisions here supersede that thread where they differ, especially its one-time-price examples and suggestion to reject sign-in after a subscription ends.

## Public landing

- Host a separate, static Astro site on Vercel at `https://jobtrakcr.com`. Keep the signed-in React application and Spring API together on the VPS at `https://app.jobtrakcr.com`.
- Port the source landing's look and section structure into English. Place a same-origin `<iframe src="/demo">` immediately below the hero; `/demo` is a public interactive React page. Wrap the iframe in a decorative Safari-style browser shell built with HTML and CSS, including three dots and a faux address bar, while keeping iframe controls clickable. Keep the FAQ and remove the contact form.
- The demo is a deliberately simple standalone replica of the app's visible screens. Its top-level navigation mirrors the real app's Applications/Kanban and Documents views. Visitors can move fictional Kanban cards, open prepared Application details and CV Generation history, browse a mock Documents table, and preview locally stored Generated CVs. Prepare those CVs using the real app with fictional input, then store the results as public assets. No create, edit, upload, download, authentication, API call, or CV Generation action is available. Card moves change only local demo state, which resets to the prepared state on iframe reload. Preview-only means the UI offers no download control; the public fictional assets can still be saved outside the UI.
- Replace unsupported review or customer-count claims with factual product or pricing copy. The pricing card shows **€10.99/week, including applicable tax**, describes unlimited CV Generation and the capacity of **20 saved Generated CVs per Application**, and makes weekly renewal clear. It shows no USD estimate or currency explanation.
- The footer links to Terms, Privacy, and Cancellation/Refund pages and displays `support@jobtrakcr.com`. The address is a placeholder until it routes to the owner's existing inbox.
- Subscribe calls to action start Stripe-hosted Checkout through Spring; returning Users have a sign-in path to the app. Vercel holds no Stripe secret or JobTrackr session logic.

## Billing and account lifecycle

- Sell one recurring weekly JobTrackr Subscription per buyer. The EUR base Price is €10.99 with inclusive tax behavior. Stripe may offer a converted USD amount at Checkout; converted renewal amounts can vary with exchange rates.
- Accept real payments. Start with promptly confirming payment methods, such as cards and supported card wallets. Do not grant access from a Checkout redirect alone; the backend reconciles verified Stripe events and confirms payment.
- A first-time buyer pays before registration. The first paid week begins with Stripe billing even if registration is delayed. The Checkout Email becomes the fixed User Primary Email at registration.
- Registration offers password or Google sign-up. Password sign-up requires an email ownership link delivered through Resend; Google sign-up requires the same verified email. Either path consumes one paid Registration Claim. A buyer who leaves Checkout can request a one-time recovery link at the Checkout Email. An unclaimed purchase cannot create a User after paid access has ended.
- Prevent a second active subscription for the same Billing Customer or Checkout Email before registration, and for the linked User afterward. A former subscriber signs into the existing User and starts a new Checkout with its existing Billing Customer.
- Allow cancellation at the end of the paid week; paid features remain available until then. A failed renewal payment moves the User to Limited Access immediately. Configure retries for days 1 and 3, restore paid features when payment succeeds, and cancel the subscription after both retries fail.
- Use Stripe's Customer Portal for card updates, invoices, and cancellation. Account Settings needs a **Manage billing** action, not a billing tab.

## Application access

| Action | Paid access | Limited Access after expiry or failed payment |
| --- | --- | --- |
| Sign in and view existing Applications | Yes | Yes |
| Edit existing Applications, including Kanban moves | Yes | Yes |
| Add Interviews and create reusable Tags through an existing Application | Yes | Yes |
| View previously Generated CVs | Yes | Yes |
| Create an Application or upload a Base CV | Yes | No |
| Start CV Generation | Yes | No |

A paid User may start one CV Generation at a time per Application and have jobs in progress across different Applications. The current global worker capacity may queue jobs; no global per-User one-job rule is part of the offer.

## Backend and deployment shape

- Keep Stripe API calls and webhook processing in Spring. Persist Billing Customers, subscriptions, Checkout Sessions or Registration Claims, invoice/payment outcomes, and processed Stripe event IDs in Flyway-managed tables. Link a Billing Customer to a User only after verified registration. Do not treat a stored Checkout URL as durable access proof.
- Verify Stripe webhook signatures, process events idempotently, and derive paid versus Limited Access from the durable billing state. Enforce paid-only actions in the API even for existing authenticated sessions.
- Remove Cloudflare Access from the customer-facing app hostname. Keep it available for private staging. Preserve the existing same-origin SPA/API setup, secure cookies, and loopback-only VPS publishing. Stripe webhooks reach the public app hostname.
- Configure the domain, Stripe live and test settings, Resend sending domain, support email routing, and public policy pages before accepting live customers. Policy text still needs the seller details and final refund terms; those have not been supplied in this discussion.

The related glossary and decisions are in `CONTEXT.md` and `docs/adr/0012` through `0017`.
