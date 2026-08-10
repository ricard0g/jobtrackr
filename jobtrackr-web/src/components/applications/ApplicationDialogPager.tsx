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
            className={cn("relative min-h-0 flex-1 overflow-hidden", className)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="flex h-full w-[200%] transition-transform duration-300 ease-out"
                style={{
                    transform:
                        activePane === "details" ? "translateX(0%)" : "translateX(-50%)",
                }}
            >
                <div className="h-full w-1/2 min-w-0 overflow-y-auto overscroll-contain">
                    {details}
                </div>
                <div className="h-full w-1/2 min-w-0 overflow-y-auto overscroll-contain">
                    {generate}
                </div>
            </div>
        </div>
    );
}
