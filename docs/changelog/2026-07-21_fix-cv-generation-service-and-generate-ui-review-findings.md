## `2026-07-21` — CV generation review findings resolved

**Type:** `fix`
**Branch:** `cursor/fix-cv-generation-review-182c`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Review identified that job-description lookup responsibility was split across the CV generation service and the Generate screen. The UI also loaded this route-critical data through an effect-driven action instead of the route loader.

### Solution

Moved job-description lookup into `CvGenerationService` and loaded the data from the Generate route loader. Updated the associated tests to use the project's given/when/then structure.

### What Changed

- Moved job-description lookup into `CvGenerationService`
- Loaded job descriptions through the Generate route loader
- Removed the effect-driven action used to fetch route data
- Aligned new tests with given/when/then conventions

### Impact

The Generate page receives job-description data predictably during route loading, with clearer service ownership and maintainable tests.
