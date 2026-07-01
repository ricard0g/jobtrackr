# Migration Roadmap

Use this as the practical work plan for agents iterating inside `jobtrackr-web`.

## Phase 1: English Cleanup

- Replace all Spanish UI strings with English.
- Replace `Intl.DateTimeFormat("es-ES", ...)` with an English locale.
- Replace Spanish validation fallback messages in `src/lib/api.ts` and components.
- Rename user-facing "Postulation" wording to "Application".
- Consider renaming components and types that use `Postulation` for code clarity.

Verification:

- Run `rg -n "Postul|postul|Bienvenido|Empresa|Estatus|Salario|Ubicacion|Modalidad|Fuente|Fecha|Etiquetas|Entrevistas|Cancelar|Guardar|Crear|Eliminar|No indicada|No indicado|Desde|Hasta|Presencial|Hibrido|Remoto|Telefonica|Tecnica|Pendiente|Superada|Fallida|Cancelada|sesion|solicitud|autenticacion" src`.
- The command should return only intentional compatibility names, if any.

## Phase 2: API Client Parity

Add missing methods to the frontend API boundary:

- Applications:
  - `getApplicationById`
  - `putApplication`
  - `getApplicationStatusHistory`
  - `createAndAttachTag`
- Companies:
  - `getCompanyById`
  - `createCompany`
  - `putCompany`
  - `deleteCompany`
- Tags:
  - `getTagById`
  - `createTag`
  - `putTag`
  - `deleteTag`
- Interviews:
  - `getInterviewById`
  - `putInterview`

Also add missing TypeScript request/response types:

- `ApplicationPutRequest`
- `StatusHistory`
- `CompanyCreateRequest`
- `CompanyPutRequest`
- `TagCreateRequest`
- `TagPutRequest`
- `InterviewPutRequest`

## Phase 3: Route And Mutation Structure

Current project guidance favors React Router Data Mode. Move component-owned server mutations toward actions/fetchers where practical:

- Keep route-critical reads in loaders.
- Use route actions or `useFetcher` for create/update/delete mutations.
- Keep local state only for client UI state and optimistic drag/drop.
- Revalidate route data after mutations that affect loaded collections.

Do not introduce React Router Framework Mode files.

## Phase 4: Domain UI Coverage

Applications:

- Add tag selection to create form.
- Decide how edit forms handle clearing optional fields:
  - Prefer PUT for full edit forms.
  - Use PATCH only for partial non-null updates.
- Add status history view in application detail.
- Consider application detail route if drawer state becomes too dense.

Companies:

- Add company CRUD UI.
- Add inline company creation from application create.
- Surface delete conflict when company has applications.

Tags:

- Add tag CRUD UI.
- Prevent edit/delete controls for global tags.
- Add create-and-attach tag in application detail.

Interviews:

- Add edit interview workflow.
- Add outcome update using interview PUT.
- Keep create default outcome as Pending unless backend changes.

## Phase 5: Validation And Error UX

- Centralize enum display labels.
- Centralize DTO validation helpers where duplication appears.
- Map backend `fieldErrors` into form controls.
- Map common backend error codes to concise English messages.
- Preserve backend field names in payloads.

## Phase 6: Verification

Before completing major migration chunks:

- `npm run lint`
- `npm run build`
- Manual auth smoke test against local backend:
  - register/login
  - refresh on page load
  - logout
- Manual domain smoke test:
  - create company
  - create tag
  - create application with company/tags
  - edit application
  - drag application across statuses
  - view status history
  - create/edit/delete interview

