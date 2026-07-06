# Frontend Current State

## Stack

- App root: `src/main.tsx`
- UI root: `src/App.tsx`
- API client: `src/lib/api.ts`
- Domain types: `src/types/*`
- Routes/data: `src/routes/*`
- UI components:
  - `src/components/kanban/*`
  - `src/components/postulations/*`
  - `src/components/shared/Navbar.tsx`
  - `src/components/ui/*`

Dependencies:

- React 19
- React Router 7 Data Mode
- Vite 8
- TypeScript 6
- Tailwind CSS 4
- shadcn/Radix primitives
- lucide-react
- `@dnd-kit/react`

## Routing

`src/main.tsx` defines three routes:

- `/auth/login`
  - `Component`: `LoginPage`
  - `loader`: `publicAuthLoader`
  - `action`: `loginAction`
- `/auth/register`
  - `Component`: `RegisterPage`
  - `loader`: `publicAuthLoader`
  - `action`: `registerAction`
- `/`
  - `Component`: `App`
  - `loader`: `appLoader`
  - `action`: `appAction`

`appLoader` calls `requireSession()`, then loads:

- `api.getCurrentUser()`
- `api.getApplications()`
- `api.getCompanies()`
- `api.getTags()`

`appAction` currently supports only `intent=logout`.

## Current API Client

`src/lib/api.ts` computes:

- `API_ORIGIN` from `VITE_API_ORIGIN`, or legacy `VITE_API_URL` with `/api/v1` stripped, or `http://localhost:8080`.
- `API_BASE_URL = ${API_ORIGIN}/api/v1`
- `AUTH_BASE_URL = ${API_ORIGIN}/auth`

The access token is stored in module memory only. Refresh token is held by the backend as an HttpOnly cookie. Refresh and logout include credentials and CSRF.

Implemented API methods:

- `getCurrentUser`
- `getApplications`
- `getCompanies`
- `getTags`
- `createApplication`
- `patchApplication`
- `patchApplicationStatus`
- `deleteApplication`
- `getInterviews`
- `createInterview`
- `deleteInterview`
- `setApplicationStatus`

Missing client methods:

- `getApplicationById`
- `putApplication`
- `getApplicationStatusHistory`
- `createAndAttachTag`
- company `get/create/put/delete`
- tag `get/create/put/delete`
- interview `get/put`

## Current UI Workflows

Authentication:

- Login and register forms are English.
- Some fallback API errors remain Spanish in `src/lib/api.ts`.
- `publicAuthLoader` does not redirect authenticated users away from auth pages.

Kanban:

- Applications are grouped and ordered by `applicationStatus` and `applicationKanbanOrder`.
- Dragging within a column persists changed orders through application PATCH.
- Dragging across columns first patches status, then patches changed orders.
- Failed drag persistence rolls local state back for the latest persistence version.

Application create:

- Dialog uses loaded companies from `GET /companies`, which includes global pre-seeded companies plus user-owned companies.
- It does not allow creating a company inline.
- It computes `applicationKanbanOrder` as the count of applications in the selected status.
- It supports title, status, company, salary range, currency, location, remote type, URL, source, and applied date.
- It does not support selecting tags on create even though `ApplicationCreateRequestDto` supports `tagIds`.

Application detail:

- Loads interviews with component `useEffect` when drawer opens.
- View mode shows salary, location, remote type, source, applied date, URL, tags, and interviews.
- Edit mode patches application fields and can change status.
- Tags mode patches `addTagIds` and `removeTagIds`.
- Delete uses `window.confirm`.

Interviews:

- Existing UI can list, create, and delete interviews.
- It cannot edit interview fields or outcome.
- Create request does not send outcome; backend defaults to `PENDING`.

## Spanish Text Hotspots

Known files containing Spanish UI strings or Spanish formatting:

- `src/types/application.ts`
- `src/lib/api.ts`
- `src/components/shared/Navbar.tsx`
- `src/components/kanban/PostulationCard.tsx`
- `src/components/postulations/CreatePostulationDialog.tsx`
- `src/components/postulations/PostulationDetailDrawer.tsx`

Also change `Intl.DateTimeFormat("es-ES", ...)` to an English locale, preferably `en-US` unless product requirements specify otherwise.

