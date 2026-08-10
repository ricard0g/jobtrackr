import {
	type ReactNode,
	type TouchEvent,
	useEffect,
	useRef,
	useState,
} from "react";

import { cn } from "@/lib/utils";

export type ApplicationDialogPane = "details" | "generate";

type ApplicationDialogPagerProps = {
	activePane: ApplicationDialogPane;
	details: ReactNode;
	generate: ReactNode | null;
	onPaneChange: (pane: ApplicationDialogPane) => void;
	className?: string;
};

const SWIPE_THRESHOLD_PX = 56;

/** Must match `gap-x-12` (Tailwind spacing 12 = 3rem). */
export const APPLICATION_PAGER_GAP = "3rem";

type TouchPoint = {
	x: number;
	y: number;
};

export function paneFromSwipeGesture({
	activePane,
	deltaX,
	deltaY,
	threshold = SWIPE_THRESHOLD_PX,
}: {
	activePane: ApplicationDialogPane;
	deltaX: number;
	deltaY: number;
	threshold?: number;
}): ApplicationDialogPane | null {
	if (Math.abs(deltaX) < threshold) return null;
	// Prefer scroll: ignore gestures that are not clearly horizontal.
	if (Math.abs(deltaX) <= Math.abs(deltaY)) return null;

	if (deltaX < 0 && activePane === "details") return "generate";
	if (deltaX > 0 && activePane === "generate") return "details";
	return null;
}

/** Translate that accounts for full viewport panes plus the inter-pane gap. */
export function applicationPagerTrackTransform(
	activePane: ApplicationDialogPane,
	gap: string = APPLICATION_PAGER_GAP,
): string {
	return activePane === "details"
		? "translateX(0)"
		: `translateX(calc(-100cqw - ${gap}))`;
}

function useMobileViewport() {
	const [isMobile, setIsMobile] = useState(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return false;
		}
		return window.matchMedia("(max-width: 767px)").matches;
	});

	useEffect(() => {
		if (typeof window.matchMedia !== "function") return;
		const media = window.matchMedia("(max-width: 767px)");
		const onChange = () => setIsMobile(media.matches);
		onChange();
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	return isMobile;
}

export function ApplicationDialogPager({
	activePane,
	details,
	generate,
	onPaneChange,
	className,
}: ApplicationDialogPagerProps) {
	const allowSwipe = useMobileViewport();
	const touchStart = useRef<TouchPoint | null>(null);

	const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
		if (!allowSwipe) return;
		const touch = event.touches[0];
		if (!touch) return;
		touchStart.current = { x: touch.clientX, y: touch.clientY };
	};

	const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
		if (!allowSwipe || touchStart.current === null) return;
		const touch = event.changedTouches[0];
		if (!touch) {
			touchStart.current = null;
			return;
		}

		const deltaX = touch.clientX - touchStart.current.x;
		const deltaY = touch.clientY - touchStart.current.y;
		touchStart.current = null;

		const nextPane = paneFromSwipeGesture({
			activePane,
			deltaX,
			deltaY,
		});
		if (!nextPane) return;

		event.preventDefault();
		onPaneChange(nextPane);
	};

	return (
		<div
			data-application-pager
			className={cn(
				// Viewport clips X (pane slide). Vertical scroll lives on each pane.
				"@container relative flex min-h-0 flex-1 flex-col overflow-hidden",
				className,
			)}
			onTouchStart={handleTouchStart}
			onTouchEnd={handleTouchEnd}
		>
			<div
				className="flex min-h-0 flex-1 gap-x-12 transition-transform duration-300 ease-out motion-reduce:transition-none"
				style={{
					transform: applicationPagerTrackTransform(activePane),
				}}
			>
				{/* w-[100cqw] keeps each pane full viewport width so gap-x-12
				    does not shrink panes; translate includes that same gap.
				    touch-pan-y lets the browser own vertical scrolling while
				    horizontal swipes are still detected on touch end. */}
				<div
					data-application-pane="details"
					className="min-h-0 w-[100cqw] shrink-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain no-scrollbar"
				>
					{details}
				</div>
				<div
					data-application-pane="generate"
					className="min-h-0 w-[100cqw] shrink-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain no-scrollbar"
				>
					{generate}
				</div>
			</div>
		</div>
	);
}
