# Backend API Contract

Backend controllers are under `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/controller`.

All `/api/v1/**` endpoints require `Authorization: Bearer <accessToken>`. Auth endpoints use refresh cookies as described in [auth-and-session.md](./auth-and-session.md).

## Current User

Base path: `/api/v1/user`

| Method | Path | Response |
| --- | --- | --- |
| GET | `/` | `UserResponseDto` |

## Applications

Base path: `/api/v1/applications`

| Method | Path | Body | Response | Frontend status |
| --- | --- | --- | --- | --- |
| GET | `/` | none | `ApplicationResponseDto[]` | Implemented |
| GET | `/{applicationId}` | none | `ApplicationResponseDto` | Missing |
| POST | `/` | `ApplicationCreateRequestDto` | `201 ApplicationResponseDto` | Implemented |
| PUT | `/{applicationId}` | `ApplicationPutRequestDto` | `ApplicationResponseDto` | Missing |
| PATCH | `/{applicationId}` | `ApplicationPatchRequestDto` | `ApplicationResponseDto` | Implemented |
| PATCH | `/{applicationId}/status` | `ApplicationStatusPatchRequestDto` | `ApplicationResponseDto` | Implemented |
| GET | `/{applicationId}/status-history` | none | `StatusHistoryResponseDto[]` | Missing |
| POST | `/{applicationId}/tags` | `CreateTagRequestDto` | `201 TagResponseDto` | Missing |
| DELETE | `/{applicationId}` | none | `204` | Implemented |

Status patch records `StatusHistory` only when the status changes. It does not change `applicationKanbanOrder`; the frontend must patch ordering separately.

`POST /{applicationId}/tags` creates a new user tag and attaches it to the application in one request.

## Companies

Base path: `/api/v1/companies`

| Method | Path | Body | Response | Frontend status |
| --- | --- | --- | --- | --- |
| GET | `/` | none | `CompanyResponseDto[]` or `CompanyPageResponseDto` | Implemented list + paginated search |
| GET | `/{companyId}` | none | `CompanyResponseDto` | Missing |
| POST | `/` | `CompanyCreateRequestDto` | `201 CompanyResponseDto` | Missing |
| PUT | `/{companyId}` | `CompanyPutRequestDto` | `CompanyResponseDto` | Missing |
| DELETE | `/{companyId}` | none | `204` | Missing |

Company names must be unique per user and cannot duplicate a global company name. Deleting a company with applications returns conflict code `COMPANY_HAS_APPLICATIONS`.

`GET /companies` returns global pre-seeded companies plus user-owned companies. Global companies are readable and attachable to applications but cannot be updated or deleted (404). Applications may reference global `companyId` values.

Paginated search (frontend, MSW, and Java backend implemented):

| Query param | Type | Default | Description |
| --- | --- | --- | --- |
| `search` | string | `""` | Case-insensitive substring match on `companyName` |
| `page` | number | `0` | Zero-based page index |
| `size` | number | `20` | Page size |

When any query param is present, the response is:

```ts
type CompanyPageResponseDto = {
  items: CompanyResponseDto[];
  total: number;
  page: number;
  size: number;
};
```

When no query params are present, the legacy full-array response is returned for backward compatibility.

## Tags

Base path: `/api/v1/tags`

| Method | Path | Body | Response | Frontend status |
| --- | --- | --- | --- | --- |
| GET | `/` | none | `TagResponseDto[]` | Implemented list only |
| GET | `/{tagId}` | none | `TagResponseDto` | Missing |
| POST | `/` | `CreateTagRequestDto` | `201 TagResponseDto` | Missing |
| PUT | `/{tagId}` | `TagPutRequestDto` | `TagResponseDto` | Missing |
| DELETE | `/{tagId}` | none | `204` | Missing |

`GET /tags` returns global tags plus user tags, sorted by tag name in service code. Global tags are readable and attachable but not editable/deletable by the user endpoints.

## Interviews

Base path: `/api/v1/applications/{applicationId}/interviews`

| Method | Path | Body | Response | Frontend status |
| --- | --- | --- | --- | --- |
| GET | `/` | none | `InterviewResponseDto[]` | Implemented |
| GET | `/{interviewId}` | none | `InterviewResponseDto` | Missing |
| POST | `/` | `InterviewCreateRequestDto` | `201 InterviewResponseDto` | Implemented |
| PUT | `/{interviewId}` | `InterviewPutRequestDto` | `InterviewResponseDto` | Missing |
| DELETE | `/{interviewId}` | none | `204` | Implemented |

Create defaults `interviewOutcome` to `PENDING`. Updating outcome requires PUT.

## Error Response

Backend error DTO:

```ts
type ErrorResponse = {
  code: string;
  message: string;
  fieldErrors: Array<{ field: string; message: string }> | null;
};
```

Known codes:

- `USER_NOT_FOUND`
- `COMPANY_NOT_FOUND`
- `DUPLICATE_COMPANY_NAME`
- `COMPANY_HAS_APPLICATIONS`
- `APPLICATION_NOT_FOUND`
- `INTERVIEW_NOT_FOUND`
- `INVALID_APPLICATION_SALARY_RANGE`
- `TAG_NOT_FOUND`
- `DUPLICATE_TAG_NAME`
- `TOO_MANY_APPLICATION_TAGS`
- `VALIDATION_ERROR`
- `DUPLICATE_EMAIL`
- `INVALID_REFRESH_TOKEN`
- `REFRESH_TOKEN_REUSE`
- `INVALID_CREDENTIALS`

Frontend should map `fieldErrors` to form fields and show English fallback text when backend messages are not field-specific.

