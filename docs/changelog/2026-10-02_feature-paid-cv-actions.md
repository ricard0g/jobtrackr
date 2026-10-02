## `2026-10-02` — Gate Base CV upload and CV Generation by paid access

**Type:** `feature`
**Branch:** `feature/jobtrackr-landing-stripe-setup`
**Status:** `✅ Complete`

### Problem / Goal

Issue #97 requires current paid access for Base CV uploads and new CV Generations, including requests made with an existing session after payment failure or expiry.

### Solution

Both creation endpoints read durable entitlement through method security and return `403 PAID_ACCESS_REQUIRED` during Limited Access. Documents and the Application Generate pane consume the refreshed entitlement context, disable paid actions, and explain Limited Access. Existing document reads, history, deletion, and cancellation remain available.

An Application row lock serializes generation creation. A pending or processing generation blocks another request for that Application with `409 GENERATION_IN_PROGRESS`; an idempotent retry returns the existing job. Different Applications can queue jobs independently. Worker capacity remains unchanged.

### Validation

- PostgreSQL/Spring HTTP tests exercise paid uploads and generation, live-session denials, period expiry, payment recovery, saved-document access and deletion, the 20 saved CV limit, repeated generation without weekly credits, and simultaneous requests with distinct or identical idempotency keys.
- React Router tests cover disabled upload and generation controls, saved capacity, and live entitlement changes after payment failure and recovery.

### Impact

Limited Access preserves existing work while preventing new uploads and model usage. Paid access retains unlimited generation and the existing 20 saved Generated CV capacity per Application.
