## `2026-07-30` — Repair Generated CV deletion and Application navigation

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The first action implementation could prevent a confirmed Generated CV deletion from submitting correctly. It also carried Documents-specific return state into Application details, creating navigation behavior that was more complex than the rest of the product.

### Solution

Separated the confirmation control from the dialog action wrapper so deletion submits exactly once, and kept the final-row state tied to the authoritative total during revalidation. Application details now use their normal close destination at the Kanban root.

### What Changed

- Fixed confirmed Generated CV delete submission
- Prevented a premature empty-library screen while deletion revalidates
- Simplified Application-detail close behavior to return to the Kanban root
- Added regression coverage for deletion and navigation behavior

### Impact

Generated CV deletion now completes reliably, and Application navigation follows one predictable product-wide path.
