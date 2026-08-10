import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMemoryRouter,
    Outlet,
    RouterProvider,
} from "react-router";

import { BoardProvider } from "@/components/kanban/BoardProvider";
import { ApplicationDetailRoute } from "@/routes/ApplicationDetailRoute";
import type {
    ApplicationGenerateActionData,
    ApplicationGenerateLoaderData,
} from "@/routes/application-generate-data";
import type { Application } from "@/types/application";
import type { BaseCv } from "@/types/base-cv";
import type { AiConsent, CvGeneration } from "@/types/cv-generation";
import type { GeneratedCv } from "@/types/generated-cv";
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

const baseCv: BaseCv = {
    baseCvId: 1,
    originalFilename: "ricardo-base.pdf",
    format: "PDF",
    contentType: "application/pdf",
    byteSize: 1024,
    createdAt: "2026-07-10T09:00:00.000Z",
};

const consent = (overrides: Partial<AiConsent> = {}): AiConsent => ({
    consentVersion: "v1",
    consentedAt: "2026-07-01T12:00:00.000Z",
    current: true,
    ...overrides,
});

const generation = (overrides: Partial<CvGeneration> = {}): CvGeneration => ({
    cvGenerationId: 10,
    applicationId: 3,
    baseCvId: 1,
    requestedFormat: "DOCX",
    status: "COMPLETED",
    idempotencyKey: "idem-10",
    correlationId: "corr-10",
    errorCode: null,
    errorMessage: null,
    generatedCvId: 5,
    modelId: null,
    workflowVersion: null,
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    startedAt: null,
    completedAt: "2026-07-16T10:05:00.000Z",
    statusUrl: "/api/v1/cv-generations/10",
    ...overrides,
});

const generatedCv = (overrides: Partial<GeneratedCv> = {}): GeneratedCv => ({
    generatedCvId: 5,
    applicationId: 3,
    version: 1,
    originalFilename: "application-3-v1.docx",
    format: "DOCX",
    contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: 2048,
    generationId: 10,
    createdAt: "2026-07-15T09:00:00.000Z",
    ...overrides,
});

const generateLoaderData = (
    overrides: Partial<ApplicationGenerateLoaderData> = {},
): ApplicationGenerateLoaderData => ({
    applicationId: 3,
    baseCvs: [baseCv],
    consent: consent(),
    jobDescription: "Build resilient APIs.",
    generations: [],
    generatedCvs: [],
    ...overrides,
});

function BoardShell() {
    return (
        <BoardProvider data={{ user, applications: [application], tags: [] }}>
            <Outlet />
        </BoardProvider>
    );
}

function dispatchSwipe(
    target: Element,
    from: { x: number; y: number },
    to: { x: number; y: number },
) {
    const startEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(startEvent, "touches", {
        value: [{ clientX: from.x, clientY: from.y }],
    });
    const endEvent = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(endEvent, "touches", {
        value: [{ clientX: to.x, clientY: to.y }],
    });
    Object.defineProperty(endEvent, "changedTouches", {
        value: [{ clientX: to.x, clientY: to.y }],
    });
    target.dispatchEvent(startEvent);
    target.dispatchEvent(endEvent);
}

const renderApplicationDetail = (
    initialEntry = "/applications/3",
    options?: {
        action?: () => Promise<unknown> | unknown;
        generateLoader?: () =>
            | ApplicationGenerateLoaderData
            | Promise<ApplicationGenerateLoaderData>;
        generateAction?: (
            args: import("react-router").ActionFunctionArgs,
        ) =>
            | ApplicationGenerateActionData
            | Promise<ApplicationGenerateActionData>;
    },
) => {
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
                        action: options?.action,
                        children: [
                            { index: true },
                            {
                                id: "application-generate",
                                path: "generate",
                                loader:
                                    options?.generateLoader ??
                                    (() => generateLoaderData()),
                                action:
                                    options?.generateAction ??
                                    (async () =>
                                        ({
                                            ok: true,
                                            intent: "create",
                                        }) satisfies ApplicationGenerateActionData),
                            },
                        ],
                    },
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
    vi.useRealTimers();
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
        expect(
            screen.getByRole("button", { name: "Generate CV", expanded: true }),
        ).toBeTruthy();
        expect(screen.getByLabelText("Job Description")).toBeTruthy();
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
        expect(await screen.findByLabelText("Job Description")).toBeTruthy();

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
        expect(await screen.findByLabelText("Job Description")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Details/i }));
        expect(await screen.findByRole("button", { name: /Save/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    });

    it("updates the dialog header after saving application details", async () => {
        const updatedApplication: Application = {
            ...application,
            applicationTitle: "Staff Engineer",
        };

        renderApplicationDetail("/applications/3", {
            action: async () => ({
                ok: true,
                intent: "updateApplication",
                application: updatedApplication,
                boardPlacement: "preserve-position",
            }),
        });

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.click(screen.getByRole("button", { name: /^Edit$/i }));

        const titleInput = await screen.findByDisplayValue("Backend Engineer");
        fireEvent.change(titleInput, { target: { value: "Staff Engineer" } });
        fireEvent.click(screen.getByRole("button", { name: /Save/i }));

        expect(
            await screen.findByRole("dialog", { name: "Staff Engineer" }),
        ).toBeTruthy();
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

        dispatchSwipe(pager!, { x: 200, y: 100 }, { x: 40, y: 100 });

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

        dispatchSwipe(pager!, { x: 200, y: 100 }, { x: 40, y: 100 });

        expect(router.state.location.pathname).toBe("/applications/3");
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
    });

    it("does not swipe when the gesture is mostly vertical scrolling", async () => {
        stubMatchMedia(true);

        const router = renderApplicationDetail("/applications/3");
        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        const pager = dialog.querySelector("[data-application-pager]");
        expect(pager).toBeTruthy();

        // Large vertical movement with enough horizontal drift to formerly trip the threshold.
        dispatchSwipe(pager!, { x: 200, y: 40 }, { x: 120, y: 220 });

        expect(router.state.location.pathname).toBe("/applications/3");
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
    });

    it("lets the opposite tab cancel an in-flight Generate navigation", async () => {
        let resolveLoader: ((value: ApplicationGenerateLoaderData) => void) | undefined;
        const loaderPromise = new Promise<ApplicationGenerateLoaderData>((resolve) => {
            resolveLoader = resolve;
        });

        const router = renderApplicationDetail("/applications/3", {
            generateLoader: () => loaderPromise,
        });

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.click(screen.getByRole("tab", { name: /Generate/i }));
        expect(await screen.findByText(/Loading Generate/i)).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Details/i }));

        await waitFor(() => {
            expect(router.state.location.pathname).toBe("/applications/3");
            expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
                "true",
            );
        });
        expect(screen.getByRole("button", { name: /^Edit$/i })).toBeTruthy();

        await act(async () => {
            resolveLoader?.(generateLoaderData());
            await loaderPromise;
        });

        expect(router.state.location.pathname).toBe("/applications/3");
        expect(screen.getByRole("button", { name: /^Edit$/i })).toBeTruthy();
    });
});

describe("Application Generate tab — start CV Generation", () => {
    it("expands Generate CV when idle with no Generated CVs", async () => {
        renderApplicationDetail("/applications/3/generate");

        expect(
            await screen.findByRole("button", { name: "Generate CV", expanded: true }),
        ).toBeTruthy();
        expect(screen.getByLabelText("Job Description")).toBeTruthy();
        expect(
            screen.getByRole("form", { name: "Start CV Generation" }),
        ).toBeTruthy();
    });

    it("collapses as Generate another when Generated CVs exist", async () => {
        renderApplicationDetail("/applications/3/generate", {
            generateLoader: () =>
                generateLoaderData({
                    generations: [generation()],
                    generatedCvs: [generatedCv()],
                }),
        });

        expect(
            await screen.findByRole("button", { name: "Generate another", expanded: false }),
        ).toBeTruthy();
        expect(screen.queryByLabelText("Job Description")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Generate another" }));
        expect(await screen.findByLabelText("Job Description")).toBeTruthy();
    });

    it("creates a CV Generation from the Generate tab action path", async () => {
        const submitted: Array<Record<string, FormDataEntryValue>> = [];

        renderApplicationDetail("/applications/3/generate", {
            generateAction: async ({ request }) => {
                const formData = await request.formData();
                submitted.push(Object.fromEntries(formData.entries()));
                expect(new URL(request.url).pathname).toBe("/applications/3/generate");
                return { ok: true, intent: "create" };
            },
        });

        await screen.findByLabelText("Job Description");
        fireEvent.click(
            within(screen.getByRole("form", { name: "Start CV Generation" })).getByRole(
                "button",
                { name: /^Generate CV$/ },
            ),
        );

        await waitFor(() => {
            expect(submitted).toHaveLength(1);
        });
        expect(submitted[0]?.intent).toBe("create");
        expect(submitted[0]?.baseCvId).toBe("1");
        expect(submitted[0]?.format).toBe("DOCX");
        expect(String(submitted[0]?.jobDescription)).toContain("Build resilient APIs");
    });

    it("surfaces validation errors inside the expanded form", async () => {
        renderApplicationDetail("/applications/3/generate", {
            generateLoader: () =>
                generateLoaderData({
                    consent: consent({ current: false, consentVersion: null, consentedAt: null }),
                    jobDescription: "",
                }),
            generateAction: async () => ({
                ok: false,
                intent: "create",
                error: "unexpected",
            }),
        });

        const form = await screen.findByRole("form", { name: "Start CV Generation" });
        fireEvent.click(within(form).getByRole("button", { name: /^Generate CV$/ }));
        expect(await screen.findByText("A Job Description is required.")).toBeTruthy();

        fireEvent.change(screen.getByLabelText("Job Description"), {
            target: { value: "Senior backend role." },
        });
        fireEvent.click(within(form).getByRole("button", { name: /^Generate CV$/ }));
        expect(
            await screen.findByText(/You must consent to sending your Base CV/i),
        ).toBeTruthy();
    });

    it("shows limit messaging and blocks submit at the Generated CV cap", async () => {
        renderApplicationDetail("/applications/3/generate", {
            generateLoader: () =>
                generateLoaderData({
                    generatedCvs: Array.from({ length: 20 }, (_, index) =>
                        generatedCv({ generatedCvId: index + 1, version: index + 1 }),
                    ),
                }),
        });

        fireEvent.click(await screen.findByRole("button", { name: "Generate another" }));
        expect(
            await screen.findByText(/already has 20 generated CVs/i),
        ).toBeTruthy();
        expect(
            within(screen.getByRole("form", { name: "Start CV Generation" }))
                .getByRole("button", { name: /^Generate CV$/ })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("keeps the dialog shell up with in-pane pending while Generate heavy data loads", async () => {
        let resolveLoader: ((value: ApplicationGenerateLoaderData) => void) | undefined;
        const loaderPromise = new Promise<ApplicationGenerateLoaderData>((resolve) => {
            resolveLoader = resolve;
        });

        renderApplicationDetail("/applications/3", {
            generateLoader: () => loaderPromise,
        });

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        fireEvent.click(screen.getByRole("tab", { name: /Generate/i }));

        expect(screen.getByRole("dialog", { name: "Backend Engineer" })).toBeTruthy();
        expect(await screen.findByText(/Loading Generate/i)).toBeTruthy();
        expect(screen.queryByLabelText("Job Description")).toBeNull();

        await act(async () => {
            resolveLoader?.(generateLoaderData());
            await loaderPromise;
        });

        expect(await screen.findByLabelText("Job Description")).toBeTruthy();
        expect(screen.getByRole("dialog", { name: "Backend Engineer" })).toBeTruthy();
    });

    it("does not load Generate heavy data when opening Details alone", async () => {
        const generateLoader = vi.fn(() => generateLoaderData());

        renderApplicationDetail("/applications/3", { generateLoader });

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        expect(screen.getByRole("button", { name: /^Edit$/i })).toBeTruthy();
        expect(generateLoader).not.toHaveBeenCalled();
    });

    it("polls Generate data while a CV Generation is active and unlocks submit when it finishes", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let loadCount = 0;
        const generateLoader = vi.fn(() => {
            loadCount += 1;
            if (loadCount === 1) {
                return generateLoaderData({
                    generations: [generation({ status: "PROCESSING", generatedCvId: null })],
                    generatedCvs: [],
                });
            }
            return generateLoaderData({
                generations: [
                    generation({
                        status: "COMPLETED",
                        generatedCvId: 5,
                        completedAt: "2026-07-16T10:05:00.000Z",
                    }),
                ],
                generatedCvs: [generatedCv()],
            });
        });

        renderApplicationDetail("/applications/3/generate", { generateLoader });

        fireEvent.click(
            await screen.findByRole("button", { name: "Generate CV", expanded: false }),
        );
        expect(
            await screen.findByText(/already in progress for this Application/i),
        ).toBeTruthy();
        expect(
            within(screen.getByRole("form", { name: "Start CV Generation" }))
                .getByRole("button", { name: /^Generate CV$/ })
                .hasAttribute("disabled"),
        ).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });

        await waitFor(() => {
            expect(generateLoader.mock.calls.length).toBeGreaterThan(1);
        });
        expect(screen.queryByText(/already in progress for this Application/i)).toBeNull();

        const disclosure = screen.getByRole("button", { name: "Generate another" });
        if (disclosure.getAttribute("aria-expanded") !== "true") {
            fireEvent.click(disclosure);
        }
        expect(
            within(screen.getByRole("form", { name: "Start CV Generation" }))
                .getByRole("button", { name: /^Generate CV$/ })
                .hasAttribute("disabled"),
        ).toBe(false);
    });
});
