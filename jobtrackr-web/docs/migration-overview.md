# Migration Overview

The frontend started as a Spanish project and currently mixes Spanish domain naming with backend English DTO fields. The backend is the source of truth and should not be changed for this migration unless a future task explicitly requests it.

## Target Product Language

Use English everywhere in the frontend:

- Visible labels, buttons, titles, placeholders, validation errors, fallback messages, confirmations, empty states, loading text, aria labels, and date formatting.
- Domain naming in UI and code should prefer `Application` over `Postulation`.
- Current component/file names like `CreatePostulationDialog`, `PostulationCard`, and `PostulationDetailDrawer` can be renamed as part of the migration if done carefully.

Suggested English labels:

- `Postulada` -> `Applied`
- `Revision` -> `In Review`
- `Entrevista` -> `Interview`
- `Oferta` -> `Offer`
- `Descartada` -> `Rejected`
- `Retirada` -> `Withdrawn`
- `Presencial` -> `On-site`
- `Hibrido` -> `Hybrid`
- `Remoto` -> `Remote`
- `Telefonica` -> `Phone`
- `Tecnica` -> `Technical`
- `Arquitectura` -> `Architecture`
- `RRHH` -> `HR`
- `Pendiente` -> `Pending`
- `Superada` -> `Passed`
- `Fallida` -> `Failed`
- `Cancelada` -> `Cancelled`

## Backend Boundary

Backend source: `../../JobTrackrApi`.

The backend already exposes the core entities and endpoints needed for a full frontend:

- Auth: register, login, refresh, logout, CSRF bootstrap.
- Current user.
- Applications: list, detail, create, replace, patch, status patch, status history, delete, create-and-attach tag.
- Companies: list, detail, create, replace, delete.
- Tags: list, detail, create, replace, delete.
- Interviews nested under applications: list, detail, create, replace, delete.

Agents should build forms and TypeScript types from backend DTOs, not from the current partial UI.

## Current Frontend Coverage

Implemented today:

- Auth pages for login/register.
- Root loader refreshes session, then loads user, applications, companies, and tags.
- Kanban board grouped by `ApplicationStatus`.
- Application create dialog.
- Application detail drawer with edit/delete, tag assignment, interview create/delete.
- Drag and drop status/order changes.

Missing or incomplete:

- Full company CRUD UI.
- Full tag CRUD UI.
- Interview update/outcome UI.
- Application detail endpoint usage.
- Application status history UI.
- Application PUT workflow.
- Backend create-and-attach-tag endpoint.
- Route-level actions/fetchers for most mutations. Several mutations currently happen directly in components.
- English migration for all Spanish copy and `es-ES` date formatting.

## Important Backend Mismatch

`ApplicationPatchRequestDto` allows nullable optional fields in TypeScript today, but the Java service treats `null` as "not provided" for most fields:

- `applicationJobUrl`
- `applicationLocation`
- `applicationRemoteType`
- `applicationSource`
- `applicationSalaryMin`
- `applicationSalaryMax`
- `applicationCurrency`
- `applicationAppliedAt`

That means PATCH cannot clear these fields to `null` with the current backend implementation. Use `PUT /api/v1/applications/{applicationId}` when the UI must clear optional fields, or keep the UI behavior clear that PATCH edits only provided non-null fields.

