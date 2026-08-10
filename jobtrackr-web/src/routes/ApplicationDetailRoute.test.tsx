import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMemoryRouter,
    Outlet,
    RouterProvider,
} from "react-router";

import { BoardProvider } from "@/components/kanban/BoardProvider";
import { ApplicationDetailRoute } from "@/routes/ApplicationDetailRoute";
import type { Application } from "@/types/application";
import type { User } from "@/types/user";

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

function stubMatchMedia(matchesMobile = false) {
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

stubMatchMedia(false);

const application: Application = {
    applicationId: 3,
    userId: "user-1",
    applicationTitle: "Backend Engineer",
    applicationJobUrl: "https://example.com/jobs/backend",
    applicationLocation: "Madrid",
    applicationRemoteType: "HYBRID",
    applicationSource: "Referral",
    applicationSalaryMin: 60_000,
    applicationSalaryMax: 75_000,
    applicationCurrency: "EUR",
    applicationStatus: "IN_REVIEW",
    applicationKanbanOrder: 0,
    applicationAppliedAt: "2026-07-12T00:00:00.000Z",
    applicationCreatedAt: "2026-07-12T10:00:00.000Z",
    applicationUpdatedAt: "2026-07-18T10:00:00.000Z",
    company: {
        companyId: 7,
        userId: null,
        global: true,
        companyName: "Acme",
        companyWebsiteUrl: "https://example.com",
        companyLocation: "Madrid",
        companyType: "SaaS",
        companyLogo: null,
        companyCreatedAt: "2026-07-01T10:00:00.000Z",
        companyUpdatedAt: "2026-07-01T10:00:00.000Z",
    },
    tags: [],
};

const user: User = {
    userId: "user-1",
    userEmail: "candidate@example.com",
    userDisplayName: "Candidate",
    userPictureUrl: null,
    userEnabled: true,
    userLocked: false,
    userDeletedAt: null,
    userPasswordChangedAt: null,
    userLastLoginAt: null,
    userCreatedAt: "2026-07-01T10:00:00.000Z",
    userUpdatedAt: "2026-07-01T10:00:00.000Z",
};

function BoardShell() {
    return (
        <BoardProvider data={{ user, applications: [application], tags: [] }}>
            <Outlet />
        </BoardProvider>
    );
}

const applicationRoute = {
    path: "applications/:applicationId",
    Component: ApplicationDetailRoute,
    loader: () => ({ application, interviews: [] }),
    children: [
        { index: true },
        { path: "generate" },
    ],
};

const renderApplicationDetail = (initialEntry = "/applications/3") => {
    const router = createMemoryRouter(
        [
            {
                path: "/",
                Component: BoardShell,
                children: [
                    { index: true, element: <div>Kanban route</div> },
                    applicationRoute,
                ],
            },
        ],
        {
            initialEntries: ["/", initialEntry],
            initialIndex: 1,
        },
    );
    render(<RouterProvider router={router} />);
    return router;
};

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    stubMatchMedia(false);
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("Application dialog Details | Generate shell", () => {
    it("opens the Details pane at /applications/:id", async () => {
        const router = renderApplicationDetail("/applications/3");

        expect(
            await screen.findByRole("dialog", { name: "Backend Engineer" }),
        ).toBeTruthy();
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
        expect(screen.getByRole("tab", { name: /Generate/i }).getAttribute("aria-selected")).toBe(
            "false",
        );
        expect(screen.getByRole("button", { name: /^Edit$/i })).toBeTruthy();
        expect(router.state.location.pathname).toBe("/applications/3");
    });

    it("opens the Generate pane at /applications/:id/generate", async () => {
        const router = renderApplicationDetail("/applications/3/generate");

        expect(
            await screen.findByRole("dialog", { name: "Backend Engineer" }),
        ).toBeTruthy();
        expect(screen.getByRole("tab", { name: /Generate/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "false",
        );
        expect(screen.getByText(/Generate pane placeholder/i)).toBeTruthy();
        expect(router.state.location.pathname).toBe("/applications/3/generate");
    });

    it("switches panes with bottom tabs using replace navigation", async () => {
        const router = renderApplicationDetail("/applications/3");

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.click(screen.getByRole("tab", { name: /Generate/i }));

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/applications/3/generate");
            expect(router.state.historyAction).toBe("REPLACE");
        });
        expect(screen.getByText(/Generate pane placeholder/i)).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Details/i }));

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/applications/3");
            expect(router.state.historyAction).toBe("REPLACE");
        });
        expect(screen.getByRole("button", { name: /^Edit$/i })).toBeTruthy();
    });

    it("keeps the Details pane alive when switching to Generate and back", async () => {
        renderApplicationDetail("/applications/3");

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.click(screen.getByRole("button", { name: /^Edit$/i }));
        expect(await screen.findByRole("button", { name: /Save/i })).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Generate/i }));
        expect(await screen.findByText(/Generate pane placeholder/i)).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Details/i }));
        expect(await screen.findByRole("button", { name: /Save/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    });

    it("closes to the Kanban root with Escape from Details", async () => {
        const router = renderApplicationDetail("/applications/3");

        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/");
            expect(screen.getByText("Kanban route")).toBeTruthy();
        });
    });

    it("closes to the Kanban root with Escape from Generate", async () => {
        const router = renderApplicationDetail("/applications/3/generate");

        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/");
            expect(screen.getByText("Kanban route")).toBeTruthy();
        });
    });

    it("leaves the dialog on Back instead of flipping between panes", async () => {
        const router = renderApplicationDetail("/applications/3");

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.click(screen.getByRole("tab", { name: /Generate/i }));

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/applications/3/generate");
            expect(router.state.historyAction).toBe("REPLACE");
        });

        await act(async () => {
            await router.navigate(-1);
        });

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/");
            expect(screen.getByText("Kanban route")).toBeTruthy();
        });
    });

    it("swipes between panes on mobile viewports", async () => {
        stubMatchMedia(true);

        const router = renderApplicationDetail("/applications/3");
        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        const pager = dialog.querySelector("[data-application-pager]");
        expect(pager).toBeTruthy();

        // jsdom + remove-scroll: build touch-like events that include clientX on touches.
        const startEvent = new Event("touchstart", { bubbles: true, cancelable: true });
        Object.defineProperty(startEvent, "touches", {
            value: [{ clientX: 200, clientY: 100 }],
        });
        const endEvent = new Event("touchend", { bubbles: true, cancelable: true });
        Object.defineProperty(endEvent, "touches", {
            value: [{ clientX: 40, clientY: 100 }],
        });
        Object.defineProperty(endEvent, "changedTouches", {
            value: [{ clientX: 40, clientY: 100 }],
        });
        pager!.dispatchEvent(startEvent);
        pager!.dispatchEvent(endEvent);

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/applications/3/generate");
            expect(router.state.historyAction).toBe("REPLACE");
        });
    });

    it("does not swipe between panes on desktop viewports", async () => {
        stubMatchMedia(false);

        const router = renderApplicationDetail("/applications/3");
        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        const pager = dialog.querySelector("[data-application-pager]");
        expect(pager).toBeTruthy();

        const startEvent = new Event("touchstart", { bubbles: true, cancelable: true });
        Object.defineProperty(startEvent, "touches", {
            value: [{ clientX: 200, clientY: 100 }],
        });
        const endEvent = new Event("touchend", { bubbles: true, cancelable: true });
        Object.defineProperty(endEvent, "touches", {
            value: [{ clientX: 40, clientY: 100 }],
        });
        Object.defineProperty(endEvent, "changedTouches", {
            value: [{ clientX: 40, clientY: 100 }],
        });
        pager!.dispatchEvent(startEvent);
        pager!.dispatchEvent(endEvent);

        expect(router.state.location.pathname).toBe("/applications/3");
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
    });
});
