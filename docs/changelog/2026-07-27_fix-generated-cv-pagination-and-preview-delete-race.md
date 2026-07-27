## `2026-07-27` — Harden Generated CV list pagination and preview delete races

**Type:** `fix`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The Generated CV library used `JOIN FETCH` with Spring `Pageable`, which can force Hibernate to load every owned document before paging in memory. DOCX preview conversion could also leave a warmed cache object when the source disappeared between the ownership re-check and the R2 upload.

### Solution

Paginate Generated CV IDs first, then fetch only that page with association joins and restore ID order in the service. After warming a DOCX preview cache, re-check ownership again and schedule durable cleanup if the source is gone.

### What Changed

- Split Generated CV user-wide listing into ID page + association fetch
- Preserved newest-first ID order after the unordered `IN` fetch
- Failed closed and scheduled preview cleanup when a source disappears after cache warm
- Applied the same post-upload orphan guard to Base CV DOCX conversion

### Impact

Documents pagination stays bounded as libraries grow, and deleted documents cannot leave lasting orphaned preview PDFs from in-flight conversions.
