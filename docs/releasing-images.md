# Publishing JobTrackr Images

This is the GHCR release path. It is not host-run development, local full Compose, or VPS deployment.

GitHub Actions turns a verified commit into three application images. Those images are published only after their build-time tests, Compose validation, and release smoke all pass. Rollback identity is always the immutable commit-SHA tag.

## Image coordinates

| Service | Image |
|---|---|
| Frontend | `ghcr.io/ricard0g/jobtrackr/frontend` |
| Backend | `ghcr.io/ricard0g/jobtrackr/backend` |
| CV Generation | `ghcr.io/ricard0g/jobtrackr/cv-generation` |

Local Compose still defaults to `jobtrackr-frontend:local`, `jobtrackr-backend:local`, and `jobtrackr-cv-generation:local`. Override those with `JOBTRACKR_FRONTEND_IMAGE`, `JOBTRACKR_BACKEND_IMAGE`, and `JOBTRACKR_CV_GENERATION_IMAGE` when you want Compose to start a prebuilt release instead of rebuilding from the checkout.

## Tag policy

| Tag | Example | Use |
|---|---|---|
| Immutable commit SHA | `sha-0123456789abcdef0123456789abcdef01234567` | Deploy and rollback. This is the release identity. |
| Moving branch tag | `main` or `feature-full-containerization-services` | Discovery only. It moves on the next successful publish from that branch. |

Do not pin a deployment or rollback to a branch tag. Select the `sha-` tag that was published for the commit you want.

## Supported publication events

| Event | Verification | Publish to GHCR |
|---|---|---|
| Pull request | Yes | No |
| Push to `main` | Yes | Yes |
| Push to `feature/full-containerization-services` | Yes | Yes |
| Manual `workflow_dispatch` | Yes | Yes |

The workflow is [Release images](../.github/workflows/release-images.yml). It authenticates to GHCR with `GITHUB_TOKEN`. There is no committed registry password and no long-lived `GHCR` secret to maintain.

Failed Compose validation, image builds, tests inside those builds, or release smoke prevent publication. Pull requests still run every gate so a broken revision cannot look green.

## What each build verifies

Images are built independently. Each Dockerfile runs that service's established compilation and test gate before the runtime stage is produced:

- Backend: Maven `verify` during the image build. CI also runs `./mvnw -B test` on the runner so the Gotenberg Testcontainers contract executes against the pinned LibreOffice image. That contract is skipped inside the image build when Docker is unavailable there.
- Frontend: TypeScript `tsc -b` and the Vite production build, then `nginx -t`.
- CV Generation: `pytest` with the fake provider. The image build does not call Gemini.

CI also renders `docker-compose.yml` with the sanitized full-stack fixture and rejects missing interpolation, weak health dependencies, and unintended public port mappings.

## Release smoke

Release smoke loads the exact image tarballs from the build jobs and starts Compose with `--no-build`. It does not rebuild a different runtime shape after verification.

```bash
./scripts/acceptance/release-smoke.sh
```

That script requires the three `JOBTRACKR_*_IMAGE` coordinates, checks that the running containers match those image IDs, and reuses the full-stack origin checks (health, SPA shell, nested route, API through frontend Nginx, registration, then login after a no-build recreate).

## Manual verification

After a successful publish run:

1. Open the [Release images](https://github.com/ricard0g/jobtrackr/actions/workflows/release-images.yml) workflow and confirm `compose-config`, the three image jobs, `release-smoke`, and `publish` succeeded.
2. Copy the published `sha-<commit>` tag from the job logs or from the GitHub Packages versions for the three images above.
3. Pull the same tag for all three services. If the packages are private, authenticate first with a token that has `read:packages`; do not put that token in the repository or in command history examples.

```bash
docker pull ghcr.io/ricard0g/jobtrackr/frontend:sha-<commit>
docker pull ghcr.io/ricard0g/jobtrackr/backend:sha-<commit>
docker pull ghcr.io/ricard0g/jobtrackr/cv-generation:sha-<commit>
```

4. Optionally start those exact images locally:

```bash
export JOBTRACKR_FRONTEND_IMAGE=ghcr.io/ricard0g/jobtrackr/frontend:sha-<commit>
export JOBTRACKR_BACKEND_IMAGE=ghcr.io/ricard0g/jobtrackr/backend:sha-<commit>
export JOBTRACKR_CV_GENERATION_IMAGE=ghcr.io/ricard0g/jobtrackr/cv-generation:sha-<commit>
./scripts/acceptance/release-smoke.sh
```

Replace `<commit>` with the full 40-character SHA. The moving `main` tag is only a pointer to whatever last published successfully; it is not a rollback target.

Creating a Generated CV with the real Gemini provider is an operator check after R2 and Gemini credentials are configured. Deterministic CI and release smoke do not call Gemini.
