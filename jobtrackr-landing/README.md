# JobTrackr public landing

Static Astro landing for `jobtrakcr.com`. The signed-in customer app remains at `app.jobtrakcr.com`.

```sh
npm ci
npm run dev
npm run check
npm run build
npx playwright install chromium
npm test
```

On Vercel, set the root directory to `jobtrackr-landing`. Astro builds to `dist/`.

## Launch dependencies

- The pricing Subscribe link targets `https://app.jobtrakcr.com/subscribe`. The paid Checkout route is implemented in the billing sub-issue; it must exist before the link is used for live sales.
- Replace the reserved browser frame below the hero with the same-origin `/demo` iframe when the Public Demo sub-issue is merged. Keep the decorative browser bar outside the iframe.
- Complete Terms, Privacy, and Cancellation/Refund wording with seller details and final refund conditions. The current pages explicitly identify missing content.
- Route `support@jobtrakcr.com` to the owner's inbox.
