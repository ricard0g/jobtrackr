# Forms And Validation

This frontend should validate forms against backend DTO constraints before submit, then map backend `fieldErrors` into form UI when server validation still fails.

## General Rules

- Keep all labels, errors, placeholders, confirmations, and empty states in English.
- Trim text values before sending when backend services trim them.
- Convert blank optional inputs to `null` for create/PUT requests.
- For PATCH, avoid sending `null` when expecting a field to clear. The backend currently skips null patch fields.
- Send date-time fields as ISO strings that Java can parse as `OffsetDateTime`.
- Use `input type="url"` only as browser assistance; still validate `http://` or `https://`.
- Use English date formatting, e.g. `Intl.DateTimeFormat("en-US", ...)`.

## Auth Forms

Login:

- Email is required and must be email-like.
- Password is required.

Register:

- Email is required and must be email-like.
- Password length: 8 to 72.
- Display name is optional.

Suggested English errors:

- `Email is required.`
- `Enter a valid email address.`
- `Password is required.`
- `Password must be between 8 and 72 characters.`
- `This email is already in use.`
- `Invalid email or password.`

## Company Forms

Fields:

- Company name: required, max 255.
- Website URL: optional, max 1024, must start with `http://` or `https://`.
- Location: optional, max 255.
- Company type: optional, max 100.
- Logo URL: optional, max 1024, must start with `http://` or `https://`.

Backend conflicts:

- Duplicate company name per user returns `DUPLICATE_COMPANY_NAME`.
- Delete with existing applications returns `COMPANY_HAS_APPLICATIONS`.

Suggested UI workflows:

- Company management page or drawer.
- Inline "Create company" from application create form, because applications require a company.
- Disable or explain delete when company has applications.

## Tag Forms

Fields:

- Category: required enum.
- Name: required, max 100.
- Color: optional, `#RRGGBB`; backend defaults missing/blank to `#808080`.

Backend conflicts:

- Duplicate tag name against global tags or user tags returns `DUPLICATE_TAG_NAME`.
- Global tags can be used but not edited/deleted.

Suggested UI workflows:

- Tag management page/drawer with category, name, color swatch.
- Application tag assignment using checkboxes or multi-select.
- Create-and-attach tag inside application detail using `POST /applications/{id}/tags`.

## Application Forms

Fields:

- Company: required positive ID.
- Title: required, max 255.
- Status: required enum.
- Job URL: optional, max 1024, `http://` or `https://`.
- Location: optional, max 255.
- Remote type: optional enum.
- Source: optional, max 255.
- Salary min: optional, >= 0, up to 2 decimals.
- Salary max: optional, >= 0, up to 2 decimals.
- Currency: optional, exactly 3 uppercase letters.
- Kanban order: optional, integer >= 0.
- Applied at: optional ISO date-time.
- Tags on create: optional positive IDs, max 50.

Cross-field rules:

- If salary min and salary max are both present, max must be >= min.
- Total attached tags cannot exceed 50.

PATCH clearing warning:

- The backend PATCH service ignores null fields, so an edit form that needs to clear optional fields should use PUT or keep existing values.
- Current frontend edit form sends `null` in a patch payload for blank fields, but the backend will not clear those values.

Suggested English errors:

- `Select a company.`
- `Enter a role title.`
- `Select a status.`
- `Enter a non-negative amount.`
- `Maximum salary must be greater than or equal to minimum salary.`
- `Use a 3-letter ISO currency code.`
- `Enter a URL starting with http:// or https://.`
- `Applications can have up to 50 tags.`

## Interview Forms

Create fields:

- Type: required enum.
- Scheduled at: required ISO date-time.
- Location: optional, max 255.
- Notes: optional, max 10000.

PUT fields:

- Same as create, plus required outcome.

Suggested UI workflows:

- Create interview from application detail.
- Edit interview to change date, type, location, notes, and outcome.
- Use outcome badges with English labels.

Suggested English errors:

- `Select an interview type.`
- `Choose a date and time.`
- `Location must be 255 characters or fewer.`
- `Notes must be 10,000 characters or fewer.`
- `Select an outcome.`

