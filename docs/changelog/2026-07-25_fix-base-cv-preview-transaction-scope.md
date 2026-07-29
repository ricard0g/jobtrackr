## `2026-07-25` — Release database transactions before preview downloads

**Type:** `fix`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Base CV preview downloads performed remote object storage work while a read-only database transaction remained open. Slow downloads could therefore occupy database resources longer than necessary.

### Solution

Removed the service-level transaction boundary from preview retrieval. Ownership is still checked, but the remote file download no longer keeps a database transaction open.

### What Changed

- Removed the read-only transaction from Base CV preview retrieval
- Kept the existing ownership validation in place
- Separated database lookup lifetime from object storage download time

### Impact

Preview downloads now use database connections more efficiently, especially when object storage is slow.
