# CV Generation Service

Stateless FastAPI microservice that generates ATS-safe tailored CVs for JobTrackr.

- No database, no R2, no end-user JWTs
- Service-to-service Bearer token auth
- Gemini key stays in this service only
- Gemini-backed evidence interpretation and CV drafting
- Deterministic fake provider restricted to local tests and explicit smoke settings
- Configuration is environment variables only (no `.env` file loading)

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health/live` | none | Liveness: process is running |
| `GET` | `/health/ready` | none | Readiness: production provider configuration is usable |
| `POST` | `/v1/generate` | Bearer | Generate tailored CV |

### `POST /v1/generate`

Multipart form:

- `file` — Base CV bytes (`pdf` / `docx` / `md`, max 10MB)
- `specification` — JSON string:

```json
{
  "output_format": "PDF" | "DOCX" | "MARKDOWN",
  "job_description": "...",
  "additional_information": "..." | null,
  "correlation_id": "uuid"
}
```

Success: raw document bytes with `Content-Type`, `Content-Disposition`, plus:

- `X-Model-Id`
- `X-Workflow-Version` (e.g. `cv-graph-v2`)

Failure: `{"code":"...","message":"..."}` with stable error codes.

## Configuration

All settings come from the process environment. Use placeholders in examples; never commit real tokens or Gemini keys.

| Variable | Default | Description |
|----------|---------|-------------|
| `CV_GENERATION_PROFILE` | `local` | `local` and `test` allow the documented default token. The release image sets `production`. |
| `CV_GENERATION_SERVICE_TOKEN` | `dev-service-token` | Bearer token. Required and must not be the default outside local/test. |
| `CV_GENERATION_PROVIDER` | `gemini` | User-facing generation requires `gemini`. `fake` is never the implicit default. |
| `CV_GENERATION_ALLOW_FAKE_PROVIDER` | `false` | Must be `true` **and** `CV_GENERATION_PROFILE` must be `local` or `test` to use the deterministic fake provider. |
| `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY` | — | Required for readiness when provider=`gemini` |
| `CV_GENERATION_MODEL_ID` | `gemini-3.1-flash-lite` | Low-latency model id reported in headers |
| `CV_GENERATION_WORKFLOW_VERSION` | `cv-graph-v2` | Workflow version header |
| `CV_GENERATION_REQUEST_TIMEOUT_SECONDS` | `300` | Hard request deadline (five minutes) |
| `MAX_BASE_CV_BYTES` | `10485760` | 10MB |
| `MAX_JOB_DESCRIPTION_CHARS` | `50000` | JD length cap |
| `MAX_ADDITIONAL_INFO_CHARS` | `5000` | Additional info cap |
| `MAX_EXTRACTED_TEXT_CHARS` | `100000` | Extracted text cap |

### Provider modes and readiness

- **Liveness** (`/health/live`) returns `200` as soon as the process is serving HTTP.
- **Readiness** (`/health/ready`) returns `200` only when this process can perform generation:
  - `gemini` needs a Gemini key, and outside local/test a non-default service token
  - `fake` is ready only when `CV_GENERATION_ALLOW_FAKE_PROVIDER=true` and the profile is `local` or `test`
- Missing Gemini configuration, the documented default token in production, or an implicit fake provider returns `503`.

## Local development

```bash
cd cv-generation-service
pip install -e ".[dev]"
export CV_GENERATION_SERVICE_TOKEN=test-token
export CV_GENERATION_PROVIDER=gemini
export GOOGLE_AI_API_KEY=your-key
uvicorn cv_generation.main:app --reload --port 8081
```

Or with uv (preferred; `./scripts/dev-cv-gen.sh` already loads the repo `.env`):

```bash
uv sync --extra dev --extra gemini
uv run uvicorn cv_generation.main:app --reload --port 8081
```

## Tests

```bash
cd cv-generation-service
pip install -e ".[dev]"
pytest
```

Pinned versions used in CI/dev are recorded in `uv.lock`. Tests set `CV_GENERATION_PROFILE=test`, enable the fake provider explicitly, and make no Gemini calls.

## Release image

A clean `docker build` runs the pytest suite (no Gemini) from `uv.lock`, then packages a non-root runtime image. The image defaults to `CV_GENERATION_PROFILE=production`, `CV_GENERATION_PROVIDER=gemini`, and `CV_GENERATION_ALLOW_FAKE_PROVIDER=false`.

```bash
docker build -t jobtrackr-cv-generation:local .
docker run --rm -p 8081:8081 \
  -e CV_GENERATION_SERVICE_TOKEN=replace-with-service-token \
  -e CV_GENERATION_PROVIDER=gemini \
  -e GOOGLE_AI_API_KEY=replace-with-gemini-key \
  jobtrackr-cv-generation:local
```

Prove the built image without Gemini:

```bash
./scripts/acceptance/cv-generation-container-smoke.sh
```

The smoke run checks production liveness vs readiness, then starts one explicit fake-provider container and performs one authenticated Markdown generation.

## Workflow stages

1. Safe extraction (reject scanned PDFs)
2. Model-backed Candidate Evidence interpretation
3. User-evidence merge (`additional_information` authoritative)
4. Candidate Evidence completeness validation
5. Job description analysis (targeting only)
6. Canonical CV drafting
7. Deterministic + semantic validation
8. Bounded revision (max 2 AI revisions)
9. Deterministic rendering (DOCX / PDF via WeasyPrint / Markdown)
10. Post-render verification
