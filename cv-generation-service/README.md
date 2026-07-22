# CV Generation Service

Stateless FastAPI microservice that generates ATS-safe tailored CVs for JobTrackr.

- No database, no R2, no end-user JWTs
- Service-to-service Bearer token auth
- Gemini key stays in this service only
- Gemini-backed evidence interpretation and CV drafting
- Deterministic fake provider restricted to automated tests

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health/live` | none | Liveness |
| `GET` | `/health/ready` | none | Readiness (real-provider config check) |
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

| Variable | Default | Description |
|----------|---------|-------------|
| `CV_GENERATION_SERVICE_TOKEN` | *(required in prod)* | Bearer token |
| `CV_GENERATION_PROVIDER` | `gemini` | User-facing generation requires `gemini` |
| `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY` | — | Required when provider=`gemini` |
| `CV_GENERATION_MODEL_ID` | `gemini-3.1-flash-lite` | Low-latency model id reported in headers |
| `CV_GENERATION_WORKFLOW_VERSION` | `cv-graph-v2` | Workflow version header |
| `CV_GENERATION_REQUEST_TIMEOUT_SECONDS` | `120` | Soft request timeout |
| `MAX_BASE_CV_BYTES` | `10485760` | 10MB |
| `MAX_JOB_DESCRIPTION_CHARS` | `50000` | JD length cap |
| `MAX_ADDITIONAL_INFO_CHARS` | `5000` | Additional info cap |
| `MAX_EXTRACTED_TEXT_CHARS` | `100000` | Extracted text cap |

## Local development

```bash
cd cv-generation-service
pip install -e ".[dev]"
export CV_GENERATION_SERVICE_TOKEN=test-token
export CV_GENERATION_PROVIDER=gemini
export GOOGLE_AI_API_KEY=your-key
uvicorn cv_generation.main:app --reload --port 8081
```

Or with uv:

```bash
uv sync --extra dev
uv run uvicorn cv_generation.main:app --reload --port 8081
```

## Tests

```bash
cd cv-generation-service
pip install -e ".[dev]"
pytest
```

Pinned versions used in CI/dev are recorded in `requirements.lock.txt` (pip freeze of direct deps). Tests explicitly enable the fake provider and make no Gemini calls.

## Docker

```bash
docker build -t cv-generation-service .
docker run --rm -p 8081:8081 \
  -e CV_GENERATION_SERVICE_TOKEN=secret \
  -e CV_GENERATION_PROVIDER=gemini \
  -e GOOGLE_AI_API_KEY=your-key \
  cv-generation-service
```

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
