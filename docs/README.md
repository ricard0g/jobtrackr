# JobTrackr Docs

Root-level documentation for running and maintaining the monorepo.

- [Running Locally](running-locally.md): host-run Spring Boot and Vite, full local Compose, optional service images, DB resets, and Git workflow.
- [Publishing Images](releasing-images.md): GHCR coordinates, tag policy, publication events, and manual verification.
- [Deploying on a VPS](deploying-vps.md): pull immutable GHCR images, publish a loopback frontend, and route that origin through host Nginx and Cloudflare Access.
- [Development Setup](development.md): database lifecycle, snapshots, and seed data details for local and cloud-agent environments.
- [Project Changelog](changelog/): commit-based records for changes not covered by the API changelog.

Subproject-specific documentation lives in:

- `JobTrackrApi/docs/`
- `jobtrackr-web/docs/`
