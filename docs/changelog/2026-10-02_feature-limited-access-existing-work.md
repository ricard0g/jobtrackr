## `2026-10-02` — Preserve existing work during Limited Access

**Type:** `feature`
**Branch:** `t3code/implement-sub-issue-98`
**Status:** `Ready for Review`

### Problem / Goal

Users need to keep tracking existing pursuits after payment failure or expiry.
The paid-action boundary was in place, but retained interactions needed explicit coverage and clearer guidance.

### Solution

Keep the existing authorization boundaries and explain the permitted actions in a Limited Access badge beside the navbar.
Exercise existing sessions through HTTP integration and React routes after both payment failure and expiry.

### What Changed

- A compact amber badge sits absolutely to the left of the centered navbar; hover, keyboard focus, or a touch tap reveals permitted and paid-only actions in a dark amber tooltip. On narrow screens, the badge uses its warning icon to keep navigation visible. A second touch tap dismisses the explanation.
- HTTP tests cover Application edits, status and Kanban position changes, Interviews, two-step Tag creation and attachment, and saved CV lists and previews.
- React route tests save edits, move a card through its status, add an Interview, create then attach a Tag, and preview a saved CV from Documents.
- Integration registrations use separate client addresses to avoid exhausting the shared registration rate limit.

### Impact

Users can continue their existing pursuits during Limited Access while the UI explains which actions require paid access.
