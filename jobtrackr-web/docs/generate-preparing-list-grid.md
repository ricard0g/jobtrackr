# Generate route: Preparing List and Grid layouts

Design note for the Generate route Preparing presentations introduced with the List/Grid comparison (#18 / #22).

## Shared rules

- Classification and ordering of Preparing vs Generated are unchanged. Both layouts render the same Preparing item sequence.
- Each Application remains a single disclosure. Active and failed items start expanded; untouched and Generated items start collapsed. Disclosure may be toggled independently.
- Switching List ↔ Grid during a visit preserves each Application's open/closed state.
- Generated stays a compact List regardless of the Preparing layout preference.
- Generate remains discoverable when valid (not hover-only). Active generations show a live Queued/Generating indicator instead.
- Company marks use the existing logo (~36px Preparing, ~24px Generated) with aspect-ratio preservation and monogram fallback.
- Keyboard, touch, focus-visible rings, reduced-motion preferences, missing/broken logos, active generation, errors, quota messaging, and missing-Base-CV route notice behave the same in both layouts.

## List (default)

- T3-inspired rich rows inside a readable `max-w-4xl` column.
- Collapsed Preparing rows show company identity (mark + name), Application title, Application status, location/remote, generation state, model/format when available, relative activity time, and Generate or the live active indicator.
- Expanded rows reveal generation metadata, failures, cancel when valid, quota notes, and Successful versions with Download/Delete.

## Grid

- Accessible segmented control labeled **Preparing layout** with List/Grid options (`aria-pressed`).
- Preference is versioned browser-local storage only (`jobtrackr:generate-preparing-layout:v1` → `list` | `grid`). It is not sent to the server, synced to a User account, or encoded in the URL. Invalid or missing values default to List.
- List and Grid share the same readable `max-w-4xl` column as Generated.
- Responsive columns: one on small screens, two from `md`, three from `xl`. Order is left-to-right, then top-to-bottom.
- Collapsed cards show company identity (mark), Application title, Application status color tag, latest generation state or `No CV yet`, relative activity time, and Generate or the live active indicator.
- Cards stay compact: centered column stack with Generate / the live indicator under the content, without forcing a large square footprint.
- Grid cards use `bg-off-white`, `border-light-gray`, and `shadow-cool-light` (same surface language as Kanban status columns) for clearer contrast against the page.
- Expanding a Grid card overlays disclosure content below the card face (out of document flow) so sibling cards and row height stay unchanged. Height and opacity animate (~300ms); chevron rotation matches. Motion is disabled under `prefers-reduced-motion`.
- Hovering the Preparing grid dims sibling cards (`opacity`) while the hovered card stays at full opacity. Expanded state does not keep a card highlighted on its own.
- Expanded cards reveal the same secondary metadata and valid actions as List items.

## Preferred follow-up experiment

If in-card Grid expansion proves visually unsatisfactory in product review, prefer a **full-width detail tray** beneath the grid row (or spanning the Preparing region) instead of growing a single card inside its column. That experiment is out of scope for the first Grid comparison.

## Visual validation checklist

Compare seeded queued, processing, failed, and completed Applications in:

1. Wide viewport List
2. Wide viewport three-column Grid
3. Narrow viewport one-column Grid

Confirm focus rings, touch targets, reduced-motion, logo failure → monogram, active indicators, errors, quota, and missing Base CV remain usable.
