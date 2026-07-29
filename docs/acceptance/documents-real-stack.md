# Documents real-stack acceptance

Prove the complete Documents workflow against the real React app, Spring API, PostgreSQL, configured R2 bucket, and pinned Gotenberg container (`gotenberg/gotenberg:8.34.0-libreoffice`). MSW-only success does not satisfy this path.

## Prerequisites

1. Copy and configure `.env` with working `R2_*` credentials and `GOTENBERG_BASE_URL`.
2. Start infrastructure and apps from the repo root:

```bash
./scripts/dev-up.sh
./scripts/dev-api.sh
./scripts/dev-web.sh
```

3. Confirm health:

```bash
curl -s http://localhost:8080/actuator/health
curl -s http://localhost:3000/health
```

Optional seed login (`agent@example.test` / `dev-password`) is useful for the manual UI checklist, but the automated path registers its own disposable user.

## Automated HTTP path

Runs upload, authenticated streaming preview, Markdown source delivery, DOCX cache miss/hit against real Gotenberg + R2, Download Original source checks, Generated CV pages of twenty, Generated CV previews, delete + cleanup scheduling, and authorization checks:

```bash
./scripts/acceptance/documents-real-stack.sh
```

The script prints `✓` for each proven step and exits non-zero on the first failure.

## Manual UI checklist

With the web app at `http://localhost:5173` and `VITE_API_MOCKING=false`:

1. Sign in (seed user or the disposable user printed by the script).
2. Open Documents and confirm Base CVs remain primary above the recessed Generated CV section.
3. Open PDF, Markdown, and DOCX previews from both sections where fixtures exist.
4. Confirm Markdown does not execute raw HTML; external links open with `noopener noreferrer`.
5. Confirm PDF/DOCX controls: Previous/Next bounds, Zoom In/Out bounds, Fit to width, Download Original, Close.
6. Navigate the dialog with keyboard; Escape closes; focus stays inside the dialog while open.
7. Resize to ~375px width and confirm controls remain usable.
8. Use Load more when more than twenty Generated CVs exist.
9. Delete a document and confirm it disappears and previewing it fails.

## Verification gates

Also run:

```bash
cd jobtrackr-web && npm run lint && npx tsc -b && npm test && npm run build
cd ../JobTrackrApi && ./mvnw test
./mvnw test -Dtest=GotenbergLibreOfficeContractTest
```

Frontend route tests cover Generated CV list failure isolation, safe Markdown rendering, zoom/page bounds, keyboard Escape, and reduced mobile viewport behavior. The Gotenberg contract test uses the pinned LibreOffice image.
