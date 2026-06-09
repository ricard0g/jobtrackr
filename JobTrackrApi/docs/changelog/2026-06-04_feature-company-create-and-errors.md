***

## `2026-06-04` — Company creation and structured errors added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The API needed company management so applications could be linked to employers. It also needed predictable error responses for common user, company, and tag failures.

### Solution

Added company creation support through controller, service, repository, DTO, and model changes. The global exception handler was expanded to return structured error responses for missing users, missing companies, duplicate companies, companies with applications, and tag errors.

### What Changed

- Added `CompanyController`, `CompanyService`, and `CompanyRepository`
- Added company create and response DTOs
- Added company and user domain exceptions
- Added shared `ErrorResponse` and validation patterns
- Removed the unused hello controller test

### Impact

Users can now create companies, and API clients receive clearer error responses when requests fail.
