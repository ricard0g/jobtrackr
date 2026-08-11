import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	APPLICATION_PAGER_GAP,
	ApplicationDialogPager,
	applicationPagerTrackTransform,
	paneFromSwipeGesture,
} from "@/components/applications/ApplicationDialogPager";

function stubMatchMedia(matchesMobile: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockImplementation((query: string) => ({
			matches: matchesMobile && query.includes("max-width: 767px"),
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	);
}

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

describe("ApplicationDialogPager touch gestures", () => {
	beforeEach(() => {
		stubMatchMedia(true);
	});

	it("does not change panes after a cancelled touch when a later touch ends", () => {
		const onPaneChange = vi.fn();
		render(
			<ApplicationDialogPager
				activePane="details"
				details={<div>Details</div>}
				generate={<div>Generate</div>}
				onPaneChange={onPaneChange}
			/>,
		);

		const pager = document.querySelector("[data-application-pager]");
		expect(pager).toBeTruthy();

		fireEvent.touchStart(pager!, {
			touches: [{ clientX: 200, clientY: 100 }],
		});
		fireEvent.touchCancel(pager!);
		fireEvent.touchEnd(pager!, {
			changedTouches: [{ clientX: 100, clientY: 100 }],
		});

		expect(onPaneChange).not.toHaveBeenCalled();
	});
});
