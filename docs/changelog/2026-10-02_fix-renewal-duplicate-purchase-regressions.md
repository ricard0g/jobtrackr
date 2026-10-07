## `2026-10-02` — Preserve initial purchases during renewal reconciliation

**Type:** `fix`
**Branch:** `t3code/implement-sub-issue-99`
**Status:** `🔄 In Progress`

### Problem / Goal

Reading the latest invoice for renewals also changed the facts used to protect and reverse duplicate purchases. A failed renewal could reopen a completed Checkout, and a delayed duplicate reversal could refund the wrong invoice.

### Solution

Keep original Checkout payment status and initial invoice details separate from the latest subscription invoice. Use the initial facts for Checkout completion and duplicate refunds while current payment controls paid access.

### What Changed

- Preserve completed Checkout state and duplicate protection during failed-payment retries.
- Persist the initial invoice reference and period for duplicate reversal.
- Record duplicate refund outcomes against the invoice actually refunded.
- Add signed HTTP regressions for a second purchase during retries and delayed reversals with paid or unpaid renewal invoices.

### Impact

Failed renewals no longer admit another active purchase, and delayed duplicate refunds target the initial payment.
