## `2026-07-30` — Deliver the redesigned Base CV library

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Base CV management needed the same structured library experience as Generated CVs while preserving upload, preview, download, and deletion workflows. Upload failures or list failures also needed to stay scoped instead of disabling the entire Documents route.

### Solution

Built the Base CV tab around a drag-and-drop upload area and a client-sorted, URL-paginated table for the bounded 20-document collection. Validation, action progress, confirmation dialogs, toasts, retry states, and API error messages are handled within the relevant control.

### What Changed

- Added sortable Name, Type, Size, and Uploaded columns with ten rows per page
- Added click, keyboard, and drag-and-drop upload for PDF, DOCX, and Markdown files
- Enforced the 10 MB file limit and 20-Base-CV library limit with clear guidance
- Added explicit Preview, Download, and confirmed Delete actions with scoped feedback
- Isolated Base CV loading and upload errors from the Generated CV library

### Impact

Users can upload and manage source CVs from a focused, resilient library without losing access to other document workflows.
