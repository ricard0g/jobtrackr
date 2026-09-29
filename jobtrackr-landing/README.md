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

## Design source

`src/styles/global.css` imports Tailwind and defines the supplied palette, Inter/Nunito fonts, radii, breakpoints, and shadows with `@theme static`. The landing and policy templates carry Tailwind utility classes directly on their elements, including responsive and interaction states. Arbitrary utilities preserve values specific to the supplied design. The supplied reset lives in Tailwind's base layer to preserve video sizing, and `public/assets/` remains a direct copy of `tmp/landing/assets/`. Some supplied image and video assets contain Spanish text as part of the original visual.

## Launch dependencies

- The pricing Subscribe link targets `https://app.jobtrakcr.com/subscribe`. The paid Checkout route is implemented in the billing sub-issue; it must exist before the link is used for live sales.
- Replace the reserved browser frame inside the hero's image figure with the same-origin `/demo` iframe when the Public Demo sub-issue is merged. Keep the decorative browser bar outside the iframe and the figure's supplied background image in place.
- Complete Terms, Privacy, and Cancellation/Refund wording with seller details and final refund conditions. The current pages explicitly identify missing content.
- Route `support@jobtrakcr.com` to the owner's inbox.
