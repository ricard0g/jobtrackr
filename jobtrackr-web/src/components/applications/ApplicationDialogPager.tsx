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
    const touchStartX = useRef<number | null>(null);

    const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
        if (!allowSwipe) return;
        touchStartX.current = event.touches[0]?.clientX ?? null;
    };

    const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
        if (!allowSwipe || touchStartX.current === null) return;
        const endX = event.changedTouches[0]?.clientX;
        if (endX === undefined) {
            touchStartX.current = null;
            return;
        }

        const deltaX = endX - touchStartX.current;
        touchStartX.current = null;

        if (deltaX <= -SWIPE_THRESHOLD_PX && activePane === "details") {
            event.preventDefault();
            onPaneChange("generate");
        } else if (deltaX >= SWIPE_THRESHOLD_PX && activePane === "generate") {
            event.preventDefault();
            onPaneChange("details");
        }
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
