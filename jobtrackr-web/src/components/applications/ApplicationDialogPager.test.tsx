import { describe, expect, it } from "vitest";

import {
	APPLICATION_PAGER_GAP,
	applicationPagerTrackTransform,
	paneFromSwipeGesture,
} from "@/components/applications/ApplicationDialogPager";

describe("applicationPagerTrackTransform", () => {
	it("keeps details at the origin", () => {
		expect(applicationPagerTrackTransform("details")).toBe("translateX(0)");
	});

	it("offsets generate by a full viewport pane plus the inter-pane gap", () => {
		expect(applicationPagerTrackTransform("generate")).toBe(
			`translateX(calc(-100cqw - ${APPLICATION_PAGER_GAP}))`,
		);
		expect(APPLICATION_PAGER_GAP).toBe("3rem");
	});
});

describe("paneFromSwipeGesture", () => {
	it("ignores mostly vertical gestures", () => {
		expect(
			paneFromSwipeGesture({
				activePane: "details",
				deltaX: -80,
				deltaY: 120,
			}),
		).toBeNull();
	});
});
