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

const renderApplicationDetail = () => {
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
        ],
        {
            initialEntries: ["/applications/3"],
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
    it("closes to the Kanban root", async () => {
        const router = renderApplicationDetail();

        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/");
            expect(screen.getByText("Kanban route")).toBeTruthy();
        });
    });
});
