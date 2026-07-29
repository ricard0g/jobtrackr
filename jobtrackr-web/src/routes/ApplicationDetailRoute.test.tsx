import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const renderApplicationDetail = (state?: unknown) => {
    const router = createMemoryRouter(
        [
            {
                path: "/",
                Component: BoardShell,
                children: [
                    { index: true, element: <div>Kanban route</div> },
                    {
                        path: "applications/:applicationId",
                        Component: ApplicationDetailRoute,
                        loader: () => ({ application, interviews: [] }),
                    },
                ],
            },
            { path: "/documents", element: <div>Documents route</div> },
        ],
        {
            initialEntries: [
                {
                    pathname: "/applications/3",
                    state,
                },
            ],
        },
    );
    render(<RouterProvider router={router} />);
    return router;
};

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("ApplicationDetailRoute return navigation", () => {
    it("closes back to the exact canonical Documents view supplied by row navigation", async () => {
        const returnTo =
            "/documents?tab=generated&page=3&sort=company&direction=asc";
        const router = renderApplicationDetail({ returnTo });

        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

        await waitFor(() => {
            expect(router.state.location.pathname + router.state.location.search).toBe(returnTo);
            expect(screen.getByText("Documents route")).toBeTruthy();
        });
    });

    it.each([
        ["direct navigation", undefined],
        ["an external return URL", { returnTo: "https://evil.example/documents" }],
        ["a non-Documents internal URL", { returnTo: "/auth/login" }],
        [
            "non-canonical Documents state",
            { returnTo: "/documents?tab=generated&page=zero&sort=created&direction=desc" },
        ],
    ])("closes %s to the Kanban root", async (_description, state) => {
        const router = renderApplicationDetail(state);

        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/");
            expect(screen.getByText("Kanban route")).toBeTruthy();
        });
    });
});
