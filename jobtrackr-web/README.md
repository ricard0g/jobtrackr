# JobTrackr Web

React SPA for JobTrackr. Host development uses Vite. The production image compiles a same-origin bundle and serves it with Nginx, which also proxies `/api/v1` to the backend.

## Host development

From the repository root:

```bash
VITE_API_MOCKING=true ./scripts/dev-web.sh
```

The app listens on `http://localhost:5173`. With mocking on, the browser uses relative `/api/v1` paths and MSW. Against the real API:

```bash
VITE_API_MOCKING=false VITE_API_ORIGIN=http://localhost:8080 ./scripts/dev-web.sh
```

| Variable | Host default | Production image |
|----------|----------------|------------------|
| `VITE_API_MOCKING` | `true` in `.env.example` | `false` (baked at image build) |
| `VITE_API_ORIGIN` | `http://localhost:8080` | empty, so requests stay same-origin `/api/v1` |

Do not bake a deployment hostname or secret into the frontend image. Same-origin relative URLs work behind local Compose, a tunnel, and later HTTPS.

See [`docs/running-locally.md`](../docs/running-locally.md) for Postgres, API, and full-app commands.

## Production container

A clean `docker build` type-checks the app, runs the Vite production build, copies the bundle into a minimal Nginx image, and syntax-checks Nginx configuration.

```bash
docker build -t jobtrackr-frontend:local ./jobtrackr-web
```

Nginx listens on container port 80:

- `/` and React Router paths return the application shell (`index.html`)
- hashed `/assets/` files are cached as immutable
- `/health` is a lightweight liveness response
- `/api/v1` is proxied to the Compose service `backend:8080`
- uploads are accepted up to 12MB (Spring’s multipart limit is 11MB)
- `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-For` preserve an outer HTTPS hop when present

Start it with the backend on the private Compose network:

```bash
docker compose --profile full --env-file .env.compose up --build
```

The frontend is published on loopback `127.0.0.1:18080` by default. Isolated image smoke still proves routing through the container network:

```bash
./scripts/acceptance/frontend-container-smoke.sh
```

The smoke run checks `/health`, the application shell, immutable hashed assets, a nested React route, and `/api/v1/auth/csrf` through Nginx to the real backend.

Keep using `./scripts/dev-web.sh` for everyday UI iteration. Full local Compose is documented in [`docs/running-locally.md`](../docs/running-locally.md). Verified GHCR tags are documented in [`docs/releasing-images.md`](../docs/releasing-images.md). Neither is the VPS deployment path.
