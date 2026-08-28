# JobTrackr Docs

Root-level documentation for running and maintaining the monorepo.

- [Running Locally](running-locally.md): host-run Spring Boot and Vite, full local Compose, configuration, DB resets, and Git workflow.
- [Publishing Images](releasing-images.md): GHCR coordinates, tag policy, publication events, and manual verification.
- [Deploying on a VPS](deploying-vps.md): pull immutable GHCR images, publish a loopback frontend, and route that origin through host Nginx and Cloudflare Access.
  - [Persistence](deploying-vps.md#persistence): PostgreSQL application state and queues; R2 Base CVs, Generated CVs, and cached previews.
  - [Backup](deploying-vps.md#backup) and [restore](deploying-vps.md#restore), including a replacement VPS with an explicit external volume.
  - [Update](deploying-vps.md#update) and [rollback](deploying-vps.md#rollback) with immutable `sha-` tags.
  - [Recovery](deploying-vps.md#recovery) and [troubleshooting](deploying-vps.md#troubleshooting).
- [Development Setup](development.md): database lifecycle, snapshots, and seed data details for local and cloud-agent environments.
- [Project Changelog](changelog/): commit-based records for changes not covered by the API changelog.

Subproject-specific documentation lives in:

- `JobTrackrApi/docs/`
- `jobtrackr-web/docs/`
