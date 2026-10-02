## `2026-10-02` — Cover method authorization across protected controllers

**Type:** `chore`
**Branch:** `feature/jobtrackr-landing-stripe-setup`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The Application controller had explicit method authorization denial tests, but the other eight protected controllers did not. Their controller tests needed to exercise Spring Security's method guards.

### Solution

Enable method security in the existing controller test slices and authenticate their normal requests. Add anonymous denial tests with HTTP filters bypassed so the method guards must prevent service calls.

### What Changed

- Test anonymous read and mutation denials for Base CV, Company, CV Generation, Generated CV, Interview, Tag, and User controllers.
- Add anonymous denial coverage for the Entitlement controller.
- Verify authenticated paid and limited entitlement responses and their no-store cache policy.

### Impact

Authorization regressions across all nine protected controllers now have explicit coverage.
