## `2026-09-29` — Add the public landing and weekly offer

**Type:** `feature`
**Branch:** `feature/jobtrackr-landing-stripe-setup`
**Status:** `🔄 In Progress`

---

### Problem / Goal

Visitors had no public landing that showed the current JobTrackr offer. The supplied design, pricing decisions, and billing plan were outside the shipped site.

### Solution

Added a static Astro landing using the supplied section structure, assets, Inter and Nunito fonts, and Tailwind theme. The latest pricing-card refinements show “All Included” and the €10.99 weekly offer in the preferred `10.99€ /week` display. The Public Demo space is reserved inside the hero image frame.

### What Changed

- Ported the responsive landing and placed Tailwind utilities on its elements; centralized colors, fonts, radii, shadows, and breakpoints in the theme.
- Kept the FAQ, added factual product copy, weekly recurring terms, support navigation, and policy routes; removed unsupported reviews and the contact form.
- Added browser checks for the offer, source visuals, mobile navigation, FAQ, and policy pages.
- Recorded the parent landing and billing decisions in the glossary, ADRs, plan, and supplied design reference.

### Impact

Visitors can review the weekly offer and policy routes before the separate Public Demo and Checkout work is connected.
