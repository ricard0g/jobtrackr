# AGENTS.md

This project uses **React Router v7 Data Mode**

Use `createBrowserRouter`, `<RouterProvider>`, route objects, `loader`, `action`, `ErrorBoundary`, `useLoaderData`, `useActionData`, `useNavigation`, `useFetcher`, and `redirect`.

Do **not** add Framework Mode conventions unless explicitly requested:
- no `@react-router/dev`
- no `routes.ts`
- no generated `+types`
- no file-based routing assumptions
- no framework SSR/SSG assumptions

## Imports

Import React Router APIs from `react-router`.

Avoid legacy `react-router-dom` imports unless the project breaks without them.

## Routes

Define route objects outside React render.

```ts
const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RootErrorBoundary,
    loader: rootLoader,
    children: [
      { index: true, Component: HomePage, loader: homeLoader },
      {
        path: "projects/:projectId",
        Component: ProjectPage,
        loader: projectLoader,
        action: projectAction,
        ErrorBoundary: ProjectErrorBoundary,
      },
    ],
  },
]);
````

Avoid JSX route trees with `<BrowserRouter>`, `<Routes>`, and `<Route>` unless migrating legacy code.

## Loaders

Use loaders for route-level reads.

Rules:

* Keep route-critical fetching out of components.
* Throw `redirect(...)` for loader navigation.
* Throw `Response` or typed app errors for expected failures.
* Validate route params.
* Keep loaders side-effect free except required read/session logic.
* Return serializable data.

```ts
export async function projectLoader({ params }: LoaderFunctionArgs) {
  const projectId = params.projectId;
  if (!projectId) throw new Response("Missing project id", { status: 400 });
...
}
```

## Actions

Use actions for route-level mutations.

Rules:

* Parse and validate `request.formData()`.
* Return field errors for recoverable validation issues.
* Use `redirect(...)` after successful mutations when appropriate.
* Do not mutate data inside components.
* Prefer `<Form method="post">` or `useFetcher()` over custom submit state.

```ts
export async function updateProjectAction({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { errors: { name: "Name is required" } };

  await updateProject(params.projectId!, { name });
  return redirect(`/projects/${params.projectId}`);
}
```

## Components

Route components consume router data; they should not refetch it.

```tsx
function ProjectPage() {
  const { project } = useLoaderData() as Awaited<ReturnType<typeof projectLoader>>;
  const navigation = useNavigation();

  return (
    <main>
      {navigation.state !== "idle" ? <Spinner /> : null}
      <h1>{project.name}</h1>
    </main>
  );
}
```

Avoid route-level `useEffect` fetching, duplicating loader data in local state, manual loading booleans when router state exists, and imperative navigation after actions when `redirect` is cleaner.

## Forms, Fetchers, and State

Use:

* `<Form>` for navigation-producing mutations
* `useFetcher()` for non-navigation/background mutations
* `useNavigation()` for global pending UI
* `fetcher.state` for local pending UI

Use optimistic UI only when failure behavior is handled.

Prefer React Router state for route data, pending navigation, submissions, mutation results, and revalidation.

Use external state only for client-only UI, cross-route ephemeral UI, or cached non-route data not owned by loaders.

## Error Handling

Every major layout route should define an `ErrorBoundary`.

Use `useRouteError()`, `isRouteErrorResponse()`, and status-aware UI for 400, 401, 403, 404, and 500.

Do not hide thrown loader/action errors inside generic component state.

## Auth

Handle auth in loaders/actions.

Rules:

* Redirect unauthenticated users in loaders/actions.
* Check authorization before returning protected data.
* Do not rely only on client-side guards.
* Keep token/session access inside data utilities when possible.

```ts
export async function requireUser(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) throw redirect("/login");
  return user;
}
```

## TypeScript

Use explicit types for loaders/actions when available:

* `LoaderFunctionArgs`
* `ActionFunctionArgs`
* domain-specific return types
* schema validation for params and form data

Avoid `any`.

If not using Framework Mode typegen, do not assume generated route types exist.

## Testing

For route behavior, test with `createMemoryRouter`, `<RouterProvider>`, real loaders/actions where practical, and mocked data services at the boundary.

Test loader success, redirects, 404/401/403 behavior, action validation errors, successful redirects, and important pending UI.

## Code Review Checklist

Before finishing a change, verify:

* The app still uses Data Mode APIs.
* New route data uses `loader`.
* Mutations use `action`, `<Form>`, or `useFetcher`.
* Error states use route error boundaries.
* Auth checks happen in loaders/actions, not only components.
* No Framework Mode-only files or APIs were introduced.
* No unnecessary `useEffect` fetching was added.
* TypeScript remains strict and avoids `any`.

## ngrok Dev Tunnel (Phone Testing)

When a user wants to preview the frontend on a phone through ngrok with the mock API, follow **`docs/cloud-agent/ngrok-dev.md`**.

Summary:

* `env VITE_API_MOCKING=true npm run dev` (no `--host 127.0.0.1`)
* `ngrok http localhost:5173` (not `127.0.0.1:5173`)
* Requires `server.allowedHosts: [".ngrok-free.app", ".ngrok.app"]` in `vite.config.ts` and same-origin API paths in mock mode (`src/lib/api-config.ts`)
* User needs an ngrok authtoken; on phone they must tap **Visit Site** on the ngrok warning page first
