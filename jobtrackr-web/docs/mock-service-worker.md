# Mock Service Worker

The frontend can run without `JobTrackrApi` by enabling MSW in development.

```bash
VITE_API_MOCKING=true npm run dev
```

When `VITE_API_MOCKING` is unset, the app uses the real backend through the normal `VITE_API_ORIGIN` / `VITE_API_URL` configuration.

## Demo Account

- Email: `demo@jobtrackr.local`
- Password: `password123`

Registering also works and creates a new mock user. New users start with empty application and user-owned company data, but still receive global pre-seeded companies and global tags, matching the real backend.

## Persistence And Reset

Mock data is stored in browser localStorage so work survives refreshes:

- `jobtrackr:mock-state:v2`

To reset the mock backend, delete that localStorage key and reload the page.

## Coverage

The mock routes mirror the current `JobTrackrApi` contract:

- `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- `/api/v1/user`
- `/api/v1/applications` including detail, create, PUT, PATCH, status PATCH, status history, create-and-attach tag, and delete
- `/api/v1/companies` including detail, create, PUT, and delete
- `/api/v1/tags` including detail, create, PUT, and delete
- `/api/v1/applications/{applicationId}/interviews` including detail, create, PUT, and delete

The mock keeps backend-shaped error responses and key service rules such as CSRF on refresh/logout, bearer-token protected API routes, duplicate name conflicts, blocked company deletion, global company read-only behavior, global tag read-only behavior, salary range validation, tag limits, and application status history.
