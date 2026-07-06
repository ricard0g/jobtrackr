# JobTrackr Web Agent Context

This directory is the local operating context for agents working only inside `jobtrackr-web` while keeping `JobTrackrApi` fundamentally unchanged.

Primary goals:

- Migrate the entire frontend experience to English. Current Spanish UI copy, messages, date locale, and "postulation" naming should become English.
- Bring the frontend into alignment with the backend contract from `JobTrackrApi`, especially models and DTOs under:
  - `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/model`
  - `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/dto`
- Add missing frontend workflows around companies, tags, interviews, status history, and form coverage without requiring backend contract changes.

Recommended reading order:

1. [migration-overview.md](./migration-overview.md)
2. [frontend-current-state.md](./frontend-current-state.md)
3. [auth-and-session.md](./auth-and-session.md)
4. [api-contract.md](./api-contract.md)
5. [data-models-and-dtos.md](./data-models-and-dtos.md)
6. [forms-and-validation.md](./forms-and-validation.md)
7. [migration-roadmap.md](./migration-roadmap.md)
8. [cloud-agent/ngrok-dev.md](./cloud-agent/ngrok-dev.md) — ngrok phone preview with mock API (cloud agents)

Project conventions to preserve:

- React 19, Vite, TypeScript, Tailwind CSS 4, shadcn/Radix UI primitives, lucide icons.
- React Router v7 Data Mode only. Follow `../AGENTS.md`: route objects, loaders, actions, `useFetcher`, and `redirect`; no Framework Mode or file-based routing.
- Import React Router APIs from `react-router`.
- Keep API boundary logic in `src/lib/api.ts` or a clear successor module.
- Keep user-facing text in English. Do not add new Spanish UI strings.

