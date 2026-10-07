# Match Public Demo Documents to the app and preview the supplied PDF

Issue: #91, follow-up correction.

The public demo now adapts `DocumentsRoute.tsx` and its document components: Your Documents tabs, Recent files cards, sortable Name/Type/Size/Created/Version/Company columns, icon actions, table surfaces, placeholder rows, and pagination footer. Mobile rows expose the app-style actions popover. The Base CV tab shows an empty prepared library; Application actions open fictional details.

The supplied `tmp/application-3-cv-v1.pdf` is copied unchanged into the public assets. All prepared Generated CV rows preview that example through `react-pdf`, with selectable text, page controls, zoom, responsive fit-to-width, and retry. PDF.js and its worker are local, and the viewer is loaded only when a preview opens. The old Markdown samples and their preparation script are removed. The demo still has no upload, download, deletion, generation, or persistence controls.

Validation passed: typechecking, static production build, all 12 landing browser tests against the production preview server, and desktop/mobile browser inspection. Coverage includes tabs/sorting, PDF rendering/zoom, mobile actions, focus restoration, request failure/retry, and iframe preview. The supplied and public PDF copies were compared byte for byte. Standards and Spec reviews reported no remaining findings.
