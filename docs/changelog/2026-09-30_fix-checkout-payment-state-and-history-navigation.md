# Correct Checkout payment state and history navigation

Unpaid Checkout attempts remain open and no longer block a successful purchase with the same Checkout Email. Migration V13 releases existing incomplete, unpaid reservations that were incorrectly recorded as paid.

Delayed events for ended subscriptions reconcile their state without refunding historical payments after a replacement purchase. HTTP regressions cover both cases with a fake Stripe boundary and real PostgreSQL.

Subscribe re-enables when browser history restores the landing from the back/forward cache. It retains its Checkout request ID and shows no loading text.

Validation: 416 backend tests and 12 landing tests passed; Astro check and production build passed. Browser verification confirmed silent loading and re-enabling after a simulated history restoration.
