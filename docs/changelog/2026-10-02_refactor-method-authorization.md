## `2026-10-02` — Declare controller authorization through Spring Security

**Type:** `refactor`
**Branch:** `feature/jobtrackr-landing-stripe-setup`
**Status:** `🔄 In Progress`

### Problem / Goal

The controller's Application creation entitlement check was imperative, and protected controllers relied on HTTP authentication alone. The User requested declarative method-level authorization throughout the protected controller surface.

### Solution

Enable Spring method security and declare authentication at protected controller classes. Application creation declares its additional capability policy through `@PreAuthorize`, reading current durable billing state for each invocation.

### What Changed

- Added authentication rules to User, Application, Company, Tag, Interview, Base CV, Generated CV, CV Generation, and entitlement controllers.
- Replaced the explicit creation guard with a reusable entitlement predicate and Spring's authorization-denial handler.
- Preserved `PAID_ACCESS_REQUIRED` for authenticated Users without current paid access and returned `ACCESS_DENIED` for generic method denials.
- Distinguished CSRF failures from other authorization failures; HTTP authentication rules, public entry points, and service ownership checks retain their existing behavior.
- Enabled real method security in controller tests, checking denial before business work even when HTTP filters are bypassed. Existing PostgreSQL HTTP tests continue to cover entitlement changes under valid sessions.

### Impact

Controller access policies are visible in annotations and enforced by Spring Security, while Limited Access retains existing work.
