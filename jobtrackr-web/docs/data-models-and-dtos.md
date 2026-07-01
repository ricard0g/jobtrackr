# Data Models And DTOs

This document mirrors the backend model and DTO packages so agents can build frontend forms without reopening the Java code every time.

Backend source:

- `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/model`
- `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/dto`

## Shared Conventions

- IDs:
  - User IDs are UUID strings.
  - Application, company, tag, interview, and status history IDs are numbers.
- Date/time fields are `OffsetDateTime` in Java and should be represented as ISO strings in TypeScript.
- Optional string fields are normalized by many services: blank strings become `null`.
- URL validation accepts empty string or `http://` / `https://` URLs: `^(|https?://\S+)$`.
- Currency must be exactly three uppercase letters, e.g. `USD`, `EUR`.
- Salary fields are decimal values, minimum `0`, with up to 10 integer digits and 2 fractional digits in DTO validation.

## Enums

```ts
type ApplicationStatus =
  | "APPLIED"
  | "IN_REVIEW"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "WITHDRAWN";

type RemoteType = "ON_SITE" | "HYBRID" | "REMOTE";

type InterviewType =
  | "PHONE"
  | "TECHNICAL"
  | "ARCHITECTURE"
  | "HR"
  | "FINAL"
  | "OTHER";

type InterviewOutcome = "PENDING" | "PASSED" | "FAILED" | "CANCELLED";

type TagCategory = "TECH_STACK" | "COMPANY_TYPE" | "MODALITY" | "OTHER";
```

Recommended English display labels:

- `ApplicationStatus`: Applied, In Review, Interview, Offer, Rejected, Withdrawn.
- `RemoteType`: On-site, Hybrid, Remote.
- `InterviewType`: Phone, Technical, Architecture, HR, Final, Other.
- `InterviewOutcome`: Pending, Passed, Failed, Cancelled.
- `TagCategory`: Tech Stack, Company Type, Modality, Other.

## User

Response DTO:

```ts
type User = {
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  userPictureUrl: string | null;
  userEnabled: boolean;
  userLocked: boolean;
  userDeletedAt: string | null;
  userPasswordChangedAt: string | null;
  userLastLoginAt: string | null;
  userCreatedAt: string;
  userUpdatedAt: string;
};
```

Model notes:

- `userEmail` is globally unique and stored as CITEXT.
- Registration normalizes email to lowercase.
- Login updates `userLastLoginAt`.

## Company

Response DTO:

```ts
type Company = {
  companyId: number;
  userId: string;
  companyName: string;
  companyWebsiteUrl: string | null;
  companyLocation: string | null;
  companyType: string | null;
  companyLogo: string | null;
  companyCreatedAt: string;
  companyUpdatedAt: string;
};
```

Create/PUT DTO:

```ts
type CompanyWriteRequest = {
  companyName: string; // required, max 255
  companyWebsiteUrl?: string | null; // max 1024, http(s) URL
  companyLocation?: string | null; // max 255
  companyType?: string | null; // max 100
  companyLogo?: string | null; // max 1024, http(s) URL
};
```

Service rules:

- Company name is trimmed.
- Company name must be unique per user.
- Blank optional strings are stored as `null`.
- Company cannot be deleted while it has applications.

## Tag

Response DTO:

```ts
type Tag = {
  tagId: number;
  tagCategory: TagCategory;
  tagName: string;
  tagColor: string;
  global: boolean;
};
```

Create/PUT DTO:

```ts
type TagWriteRequest = {
  tagCategory: TagCategory; // required
  tagName: string; // required, max 100
  tagColor?: string | null; // #RRGGBB
};
```

Service rules:

- Missing/blank color becomes `#808080`.
- Global tags have `user == null`.
- Users can read global tags and their own tags.
- Users can update/delete only their own tags.
- Tag name cannot duplicate a global tag or another tag for the same user.

## Application

Response DTO:

```ts
type Application = {
  applicationId: number;
  userId: string;
  applicationTitle: string;
  applicationJobUrl: string | null;
  applicationLocation: string | null;
  applicationRemoteType: RemoteType | null;
  applicationSource: string | null;
  applicationSalaryMin: number | null;
  applicationSalaryMax: number | null;
  applicationCurrency: string | null;
  applicationStatus: ApplicationStatus;
  applicationKanbanOrder: number;
  applicationAppliedAt: string | null;
  applicationCreatedAt: string;
  applicationUpdatedAt: string;
  company: Company;
  tags: Tag[];
};
```

Create DTO:

```ts
type ApplicationCreateRequest = {
  companyId: number; // required, positive
  applicationTitle: string; // required, max 255
  applicationStatus: ApplicationStatus; // required
  applicationJobUrl?: string | null; // max 1024, http(s) URL
  applicationLocation?: string | null; // max 255
  applicationRemoteType?: RemoteType | null;
  applicationSource?: string | null; // max 255
  applicationSalaryMin?: number | null; // >= 0, 2 decimals
  applicationSalaryMax?: number | null; // >= 0, 2 decimals
  applicationCurrency?: string | null; // /^[A-Z]{3}$/
  applicationKanbanOrder?: number | null; // >= 0, defaults to 0
  applicationAppliedAt?: string | null; // ISO date-time
  tagIds?: number[]; // max 50, positive IDs
};
```

PUT DTO:

```ts
type ApplicationPutRequest = {
  companyId: number;
  applicationTitle: string;
  applicationJobUrl?: string | null;
  applicationLocation?: string | null;
  applicationRemoteType?: RemoteType | null;
  applicationSource?: string | null;
  applicationSalaryMin?: number | null;
  applicationSalaryMax?: number | null;
  applicationCurrency?: string | null;
  applicationKanbanOrder?: number | null;
  applicationAppliedAt?: string | null;
};
```

PATCH DTO:

```ts
type ApplicationPatchRequest = {
  companyId?: number;
  applicationTitle?: string;
  applicationJobUrl?: string | null;
  applicationLocation?: string | null;
  applicationRemoteType?: RemoteType | null;
  applicationSource?: string | null;
  applicationSalaryMin?: number | null;
  applicationSalaryMax?: number | null;
  applicationCurrency?: string | null;
  applicationKanbanOrder?: number | null;
  applicationAppliedAt?: string | null;
  addTagIds?: number[];
  removeTagIds?: number[];
};
```

Status PATCH DTO:

```ts
type ApplicationStatusPatchRequest = {
  applicationStatus: ApplicationStatus;
};
```

Service rules:

- Title is trimmed on create/PUT/PATCH.
- Create/PUT default `applicationKanbanOrder` to `0` if omitted/null.
- Salary max must be greater than or equal to salary min when both are present.
- Application can have at most 50 tags.
- Attached tags must be accessible to the user: global or user-owned.
- Tags in responses are sorted by `tagId`.
- PATCH only changes fields when Java DTO values are non-null. Use PUT if the UI must clear optional fields.

## Status History

Response DTO:

```ts
type StatusHistory = {
  statusHistoryId: number;
  applicationId: number;
  statusHistoryOldStatus: ApplicationStatus | null;
  statusHistoryNewStatus: ApplicationStatus;
  statusHistoryChangedAt: string;
  statusHistoryCreatedAt: string;
};
```

Service rules:

- Status history is created only when `PATCH /applications/{id}/status` changes the current status.

## Interview

Response DTO:

```ts
type Interview = {
  interviewId: number;
  applicationId: number;
  interviewType: InterviewType;
  interviewScheduledAt: string;
  interviewLocation: string | null;
  interviewNotes: string | null;
  interviewOutcome: InterviewOutcome;
  interviewCreatedAt: string;
  interviewUpdatedAt: string;
};
```

Create DTO:

```ts
type InterviewCreateRequest = {
  interviewType: InterviewType; // required
  interviewScheduledAt: string; // required ISO date-time
  interviewLocation?: string | null; // max 255
  interviewNotes?: string | null; // max 10000
};
```

PUT DTO:

```ts
type InterviewPutRequest = {
  interviewType: InterviewType;
  interviewScheduledAt: string;
  interviewLocation?: string | null;
  interviewNotes?: string | null;
  interviewOutcome: InterviewOutcome;
};
```

Service rules:

- Create defaults `interviewOutcome` to `PENDING`.
- Blank optional strings become `null`.
- Interviews are always scoped through an application owned by the authenticated user.

