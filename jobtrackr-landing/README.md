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

### Documents and the sample PDF

The demo adapts `jobtrackr-web/src/routes/DocumentsRoute.tsx` and its `DocumentTable`, `DocumentPreviewDialog`, and `PdfDocumentViewer` components. It uses the same Documents tabs, Recent files strip, sortable columns, table surfaces, placeholder rows, pagination footer, and responsive icon actions. The Base CV tab shows an empty prepared library. Application actions open the existing fictional details.

`public/demo-cvs/application-3-cv-v1.pdf` is an unchanged copy of the example PDF supplied at `tmp/application-3-cv-v1.pdf`. All five fictional Generated CV rows use this one sample for preview; their filenames and dates represent prepared library metadata. The former generated Markdown samples and regeneration script have been removed.

The viewer uses `react-pdf` with a locally bundled PDF.js worker, selectable text, page controls, zoom, fit-to-width, and retry. The initial fit adapts to the available width, including mobile viewports. PDF annotations are omitted to keep the example preview-only. There are no upload, download, delete, or generation controls, and no live API, User, or persistence requests. The public PDF remains technically saveable outside the interface.

## Launch dependencies

- The pricing Subscribe link targets `https://app.jobtrakcr.com/subscribe`. The paid Checkout route is implemented in the billing sub-issue; it must exist before the link is used for live sales.
- Complete Terms, Privacy, and Cancellation/Refund wording with seller details and final refund conditions. The current pages explicitly identify missing content.
- Route `support@jobtrakcr.com` to the owner's inbox.
