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

## Public Demo

`/demo` is a standalone React page (`src/demo/`) that the hero embeds through a same-origin `<iframe src="/demo">`. The decorative Safari-style bar sits above the iframe in `index.astro`, never over it. The demo renders client-side only from the fictional data in `src/demo/demo-data.ts`; card moves live in memory, and a reload restores the prepared board. It makes no API, authentication, or persistence requests and offers no create, edit, upload, download, or generation controls. Unlike the landing, the demo page loads Tailwind preflight so its controls match the app.

### Fictional Generated CV assets

Documents lists the five Generated CVs attached to the prepared Applications. Each row opens its own local Markdown asset in a responsive, read-only preview. The browser only requests static files under `/demo-cvs/`; it never calls a generation service. Navigation preserves temporary Kanban moves, and reload restores the board and closes the preview.

The files in `public/demo-cvs/` were produced in advance with the **real app's FastAPI CV generation pipeline and Gemini provider**, using only the fictional Base CV and job descriptions in `demo-inputs/`. No Spring User, database record, private document, R2 upload, or development mock provider was used. Markdown is an output format supported by the signed-in app. `demo-inputs/provenance.json` records the real response model/workflow headers, generation timestamps, byte sizes, and SHA-256 hashes. Table dates represent the prepared fictional history.

To deliberately regenerate the public samples, start the real local CV service with Gemini configured, then run from the repository root with its service token in the environment:

```sh
cv-generation-service/.venv/bin/python jobtrackr-landing/scripts/generate-demo-cvs.py
```

This script uses the service's existing `httpx` dependency and requires `CV_GENERATION_SERVICE_TOKEN`. `CV_GENERATION_SERVICE_BASE_URL` defaults to `http://localhost:8081`. It refuses the fake provider. Review the generated files for fictional content and update the prepared byte sizes before committing. Generation is never part of a landing build. The preview exposes no upload, download, or generation action; public files remain technically saveable outside the interface.

## Launch dependencies

- The pricing Subscribe link targets `https://app.jobtrakcr.com/subscribe`. The paid Checkout route is implemented in the billing sub-issue; it must exist before the link is used for live sales.
- Complete Terms, Privacy, and Cancellation/Refund wording with seller details and final refund conditions. The current pages explicitly identify missing content.
- Route `support@jobtrakcr.com` to the owner's inbox.
