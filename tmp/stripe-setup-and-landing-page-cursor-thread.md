## User

Based on the current state of the project and knowing that I have the project hosted on a VPS, how do I setup Stripe and a Landing page to have a closed gateway of who can access the application actually? I think it might be actually intelligent to host my Landing and the Stripe frontend on Vercel, because they provide great analytics and other services for free.

## Assistant

Vercel is a good home for the **public marketing site**. It is a bad home for the **access gate**. JobTrackr already has a real session, and the VPS already has an outer door. Stripe and the landing page should sell access; Spring should decide who may use the app.

## What you have today

There is **no billing**. Register is public. A `User` has identity, lock flags, and AI consent — not a Stripe customer or subscription.

The VPS stack is already a closed box, but the lock is **Cloudflare Access**, not JobTrackr:

```text
browser → Cloudflare Access (email/IdP allowlist)
       → Tunnel → host Nginx → SPA + /api/v1 → Spring
```

Access only decides who may *reach* the hostname. After that, `/api/v1/auth/register` and `/login` are `permitAll`, and the SPA still does JobTrackr sign-in. The docs say this explicitly: Access is not a JobTrackr session, and you must not trust `Cf-Access-Jwt-Assertion`.

The SPA and API are **same-origin** on `JOBTRACKR_PUBLIC_ORIGIN`. Frontend Nginx proxies `/api/v1`. Refresh/CSRF cookies are `HttpOnly`, `Secure`, `SameSite=Lax`. CORS is a single origin. The frontend image gets no secrets.

That last point is the main constraint: do not put the JobTrackr SPA on Vercel.

## The split that actually works

Use two hostnames:

| Host | Where | Who can hit it |
|---|---|---|
| `jobtrackr.com` | Vercel | Anyone (landing, pricing, legal) |
| `app.jobtrackr.com` | Current VPS stack | Paying customers (and you) |

Keep today’s Compose topology on `app`. Change `JOBTRACKR_PUBLIC_ORIGIN` and `CORS_ALLOWED_ORIGINS` to `https://app.jobtrackr.com`. After checkout, Stripe should redirect there, not to Vercel.

Vercel Analytics then sees marketing traffic only. That is the right privacy split: landing analytics on Vercel, job-search data stays on the VPS.

You do **not** need a “Stripe frontend” on Vercel. Stripe Checkout and the Customer Portal are hosted by Stripe. Vercel only needs a pricing page and a button that starts a Checkout Session.

## The closed gate belongs in Spring

A Vercel page cannot close the VPS. Anyone who knows `app.jobtrackr.com` can still load `/auth/register` unless Spring refuses them.

Treat billing as a new module behind a small interface:

- **Entitlement** — “may this email/user use JobTrackr right now?”
- **Checkout** — create a Stripe Checkout Session
- **Webhook** — Stripe tells Spring the truth (`checkout.session.completed`, `customer.subscription.updated` / `deleted`, `invoice.paid` / `payment_failed`)

Store Stripe IDs in their own tables (`billing_customers`, `subscriptions`), linked to `User` by email first, then by `user_id` after register. Do not bolt `stripe_customer_id` onto `users` as the whole model.

**Recommended product flow (pay, then account):**

1. Visitor hits Vercel, clicks Subscribe.
2. Browser calls Spring `POST /api/v1/billing/checkout-sessions` (public, CSRF-exempt like login/register). Spring creates the Stripe Checkout Session with `client_reference_id` / `customer_email` and `success_url=https://app.jobtrackr.com/auth/register?session_id={CHECKOUT_SESSION_ID}`.
3. User pays on Stripe-hosted Checkout.
4. Stripe webhook hits Spring on the VPS. Spring records an active entitlement for that email/customer. **Do not trust the success URL alone.**
5. App register requires a paid, unused Checkout Session (or matching entitled email). No session → 403, not a new User.
6. Login still authenticates as today, then rejects canceled / unpaid entitlements (403 with a “manage billing” path).
7. “Manage plan” is a Spring endpoint that creates a Stripe Customer Portal session and redirects.

That is the closed gateway: **unpaid people never become Users**, and canceled Users cannot use the API even if they still have a JWT.

Disable open Google-first register until Google is a production IdP and the same entitlement check runs after the OAuth callback.

## Why Cloudflare Access cannot stay as-is

Access is currently a personal allowlist. Paying strangers cannot get through it, and **Stripe webhooks cannot get through it either**.

For customer launch:

- Take Access off `app.jobtrackr.com` (or bypass `/api/v1/billing/webhooks/stripe` *and* the whole SPA, which is the same as removing it).
- Keep Access on a staging hostname (`test.ricardoguzdev.com`) for you.
- Keep the VPS inner topology: loopback-only Docker publish, host Nginx, tunnel or later direct HTTPS. Opening Access is not the same as publishing `0.0.0.0:18080`.

Webhook path must also be CSRF-ignored and signature-verified with `STRIPE_WEBHOOK_SECRET`. Put `STRIPE_SECRET_KEY` only on the backend container, same least-scope pattern as R2 and Gemini. Never put it on Vercel or in the frontend image.

If you keep Access on the app hostname “for extra security,” you will have to automate Cloudflare’s Allow policies from Stripe events. That is a second identity system on top of JobTrackr + Google. Skip it.

## Do not host checkout-or-session logic twice

Pick **Spring** as the only Stripe API owner:

- Secret key and webhook secret live in `.env.vps`.
- Checkout Sessions and Portal Sessions are created there.
- Entitlement is written only from signed webhooks (with Checkout Session retrieval as a fallback if the webhook is delayed on the success page).

Vercel should stay static (or almost static): marketing, pricing copy, privacy/terms. The Subscribe button can be a same-page form `POST` to `https://app.jobtrackr.com/api/v1/billing/checkout-sessions` with CORS allowing the Vercel origin **only for that billing path**.

Do not add the Vercel origin to `CORS_ALLOWED_ORIGINS` as a blanket SPA origin. Today that variable means “the JobTrackr app origin.” A marketing origin calling `/login` or `/refresh` would fight `SameSite=Lax` cookies and split your session. Billing checkout is a one-shot anonymous POST; login stays on `app`.

## Concrete setup order

**1. Stripe (test mode first)**
Create the account, a Product + recurring Price, Customer Portal, and a webhook endpoint pointing at `https://app.jobtrackr.com/api/v1/billing/webhooks/stripe`. Enable the subscription lifecycle events above. Use the `whsec_...` from that endpoint, not the dashboard’s “signing secret” from another destination.

**2. Hostnames**
- Apex/www → Vercel.
- `app` → existing Cloudflare Tunnel / DNS, origin unchanged.
Google’s production consent screen wants a public homepage and privacy policy; the Vercel site is that homepage. That is one of the better reasons to split.

**3. Spring entitlement**
New Flyway tables, webhook controller, checkout controller, and a check on register/login (and on every authenticated request, or at least on JWT issue + refresh). Canceled subscription should increment `user_auth_version` or equivalent so existing access tokens die, same pattern you already use when credentials change.

**4. Close register**
`/auth/register` in the SPA should collect email/password only after `session_id` validates. Hide or remove the public register link. Login can stay visible; unpaid logins get a billing error, not a board.

**5. Vercel**
A small marketing app (Next.js or even static) is enough. Env on Vercel: `NEXT_PUBLIC_APP_ORIGIN=https://app.jobtrackr.com` and maybe `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if you later embed Pricing Table. No secret key.

**6. Relax Access on `app`**
Then verify: webhook 200s from Stripe, unpaid register 403, paid register 201, cancel → next API call 403.

## What not to do

- Do not move `jobtrackr-web` to Vercel. You would break same-origin cookies, CSRF, Google callback (`/api/v1/auth/oauth2/callback/google` must stay on `JOBTRACKR_PUBLIC_ORIGIN`), and the frontend Nginx API proxy.
- Do not use Stripe Payment Links as the long-term gate. Fine for a first smoke test; they do not bind a JobTrackr User unless you still handle the webhook in Spring.
- Do not treat Checkout success-page query params as proof of payment.
- Do not leave `/register` public and only hide the button on Vercel.
- Do not put Customer Portal or Checkout UI inside the Kanban app until entitlement exists; add “Manage billing” later on Account Settings.

If you want the smallest first slice: Stripe Checkout + webhook + closed register on the VPS, Vercel as a static landing that only links to Checkout. Customer Portal, trials, VAT, and Google-on-production can follow once that gate is real.

## User

Things to clarify please:

-
```chat_selection
agent_id: fd35f49c-e227-4cb0-9d35-81b2c7dc0088
selected_text:
App register requires a paid, unused Checkout Session (or matching entitled email)
```
 , Why 'unused Checkout session', shouldn't the session be Used because the user Paid? It is true that I'm not really knowledgeable about how Stripe usually works.
-
```chat_selection
agent_id: fd35f49c-e227-4cb0-9d35-81b2c7dc0088
selected_text:
billing_customers, subscriptions
```
 , we'll need a flyway migration then, creating two tables 'billing_customers', and 'subscriptions'. I guess that 'billing_customers' is to track each User but in this case through a 'billing management' POV which I understand requires some normalization from the users table. And 'subscriptions' just as a multivalued list for different types of subs? Explain to me the purpose of both tables.
- What's this 'Entitlement' thing around Stripe? Is this something from Stripe's ecosystem?
- The main idea is that when we hit this endpoint
```chat_selection
agent_id: fd35f49c-e227-4cb0-9d35-81b2c7dc0088
selected_text:
https://app.jobtrackr.com/api/v1/billing/webhooks/stripe
```
 , we program Spring to redirect with our internal credentials to Stripe's Checkout portal right? where everything is managed.

## Assistant

Those four points are easy to mix up because Stripe’s objects, your database, and the browser all use similar words for different things. Taking them in order.

## 1. “Unused Checkout Session” — unused by JobTrackr, not unpaid

A Stripe Checkout Session is created **before** payment. After the customer pays, Stripe marks that session `complete`. From Stripe’s point of view it **is** used: money was taken, a Customer and Subscription now exist.

“Unused” in the earlier note meant something else: **JobTrackr has not yet consumed that paid session to create a User.**

Typical timeline:

1. Spring creates a Checkout Session (`cs_…`, status `open`).
2. The person pays. Stripe sets it to `complete`.
3. Stripe sends you a webhook. Spring stores “email X is entitled.”
4. Browser lands on `/auth/register?session_id=cs_…`.
5. Register looks up that session, confirms it is `complete` **and** that no JobTrackr User has been created from it yet, then creates the User and stamps the session as consumed.

Why that last check exists: the success URL is just a link. Someone can bookmark it, refresh it, or share it. Without a one-time consume flag, one payment could mint several accounts.

So:

| Question           | Answer                                                             |
| ------------------ | ------------------------------------------------------------------ |
| Did they pay?      | Yes — Stripe session is `complete`.                                |
| Can they register? | Only if JobTrackr has not already attached that payment to a User. |

You can store that as `checkout_sessions.consumed_at`, or as “this `billing_customers` row is already linked to a `user_id`.” Same idea.

## 2. `billing_customers` and `subscriptions` — two Stripe objects, not “types of plans”

These map to Stripe’s two core records, not to a list of plan SKUs.

**Stripe Customer** = the billing person: email, payment method, invoices, tax IDs. One human should have one Customer.

**Stripe Subscription** = a recurring contract on that Customer: which Price they bought, period dates, and status (`trialing`, `active`, `past_due`, `canceled`, …).

They are separate because they are not 1:1 with `users`, and they are not 1:1 with each other.

**`billing_customers` exists because the Stripe Customer often appears before the JobTrackr User.** Pay-then-register means:

- After checkout you have `cus_123` and an email, but no `user_id` yet.
- After register you attach `users.user_id`.
- If they cancel and later buy again, you reuse the same Customer instead of creating `cus_456`.

`users` is “can sign in.” `billing_customers` is “Stripe will charge this person.” Linking them is a later step, not the starting shape.

**`subscriptions` is the history of contracts, not a menu of products.** One Customer can have:

- the current active sub
- an old canceled sub from last year
- a second sub if you ever sell add-ons

The Product/Price catalog (Free vs Pro vs Annual) lives in the Stripe Dashboard. You store the **instances** Stripe created (`sub_…`, status, current period end, price id). Access is derived from “is there an active (or trialing) subscription for this customer?” not from stuffing `stripe_status` onto `users`.

Minimal columns that are enough to start:

```text
billing_customers
  billing_customer_id     uuid PK
  user_id                 uuid NULL  → users, filled after register
  stripe_customer_id      text UNIQUE   -- cus_...
  email                   citext        -- until user_id exists

subscriptions
  subscription_id         uuid PK
  billing_customer_id     uuid FK
  stripe_subscription_id  text UNIQUE   -- sub_...
  stripe_price_id         text          -- which plan
  status                  text          -- active, past_due, canceled, ...
  current_period_end      timestamptz
```

A third table for Checkout Sessions is useful only so you can mark `session_id` consumed. You can also keep that as a column on `billing_customers` if you truly only ever have one successful checkout per email.

You do **not** need one `subscriptions` row per plan type in the catalog. Plans are Stripe Prices; rows are “this customer is on that price until this date.”

## 3. Entitlement — our word, with a Stripe cousin

**In the earlier architecture, entitlement is not a Stripe object you must buy.** It is the JobTrackr rule:

> May this email/user use the app *right now*?

That boolean is computed from subscription status (and later from grace periods: `past_due` still allowed for 3 days, etc.). Spring is the module that answers it. Stripe never sees your Kanban routes.

Stripe later added its own **[Entitlements](https://docs.stripe.com/billing/entitlements)** product: you attach features (`cv_generation`, `kanban`) to Products, and Stripe tells you which features a Customer has. That is optional. For a single paid SKU, “subscription status is `active` or `trialing`” is enough. Do not model Stripe Entitlements until you have multiple features to gate.

So: **entitlement = our access decision.** Stripe Entitlements = an optional Stripe API for feature flags. We were talking about the first one.

## 4. The webhook does not send anyone to Checkout

That URL is the opposite of a browser redirect.

```text
Stripe's servers  --POST JSON-->  your VPS  /api/v1/billing/webhooks/stripe
```

No user, no cookies, no Spring-to-Stripe login in the response. Stripe is **telling** you that something already happened (“this session was paid,” “this subscription was canceled”). You verify `Stripe-Signature`, update `billing_customers` / `subscriptions`, and return `200`. If you return HTML or a 302, Stripe treats it as a failed webhook.

The three Stripe-hosted pages and who starts them:

| Surface | Who opens it | Who creates it |
|---|---|---|
| **Checkout** | The buyer’s browser | Spring `POST /api/v1/billing/checkout-sessions` → Stripe Session → `303` to `https://checkout.stripe.com/...` |
| **Customer Portal** | An already-logged-in user | Spring `POST /api/v1/billing/portal-sessions` → `303` to `https://billing.stripe.com/...` |
| **Webhook** | Nobody | Stripe calls you |

Checkout (pay) and Portal (cancel, change card, invoices) are both Stripe-hosted. Spring’s job is: create the session with the secret key, then **redirect the browser**. The webhook is only the back channel so your DB matches Stripe even if the user closes the tab before hitting `/auth/register`.

End-to-end, with no webhook-as-redirect:

```text
Vercel "Subscribe"
  → Spring creates Checkout Session
  → browser pays on checkout.stripe.com
  → Stripe POSTs webhook to app.jobtrackr.com  (record entitlement)
  → Stripe also redirects the browser to
       https://app.jobtrackr.com/auth/register?session_id=cs_...
  → Spring creates the User if that paid session is still unconsumed
```

Later, in Account Settings, “Manage billing” is the Portal redirect. That is the page where Stripe manages cards, invoices, and cancel — still not the webhook.