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

const renderApplicationDetail = (
    initialEntry = "/applications/3",
    options?: {
        action?: () => Promise<unknown> | unknown;
        applications?: Application[];
        detailLoader?: (
            args: import("react-router").LoaderFunctionArgs,
        ) =>
            | {
                  application: Application;
                  interviews: [];
                  generations: CvGeneration[];
              }
            | Promise<{
                  application: Application;
                  interviews: [];
                  generations: CvGeneration[];
              }>;
        generateLoader?: (
            args: import("react-router").LoaderFunctionArgs,
        ) =>
            | ApplicationGenerateLoaderData
            | Promise<ApplicationGenerateLoaderData>;
        generateAction?: (
            args: import("react-router").ActionFunctionArgs,
        ) =>
            | ApplicationGenerateActionData
            | Promise<ApplicationGenerateActionData>;
    },
) => {
    const boardApplications = options?.applications ?? [application];
    function Shell() {
        return (
            <BoardProvider data={{ user, applications: boardApplications, tags: [] }}>
                <Outlet />
            </BoardProvider>
        );
    }
    const router = createMemoryRouter(
        [
            {
                path: "/",
                Component: Shell,
                children: [
                    { index: true, element: <div>Kanban route</div> },
                    {
                        path: "applications/:applicationId",
                        Component: ApplicationDetailRoute,
                        loader:
                            options?.detailLoader ??
                            (() => ({
                                application,
                                interviews: [],
                                generations: [],
                            })),
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

    it("keeps vertical overflow on each pane rather than the pager viewport", async () => {
        renderApplicationDetail("/applications/3");
        const dialog = await screen.findByRole("dialog", { name: "Backend Engineer" });
        const pager = dialog.querySelector("[data-application-pager]");
        const detailsPane = dialog.querySelector('[data-application-pane="details"]');
        const generatePane = dialog.querySelector('[data-application-pane="generate"]');

        expect(pager).toBeTruthy();
        expect(detailsPane).toBeTruthy();
        expect(generatePane).toBeTruthy();
        expect(pager!.className).toMatch(/overflow-hidden/);
        expect(pager!.className).not.toMatch(/overflow-y-scroll/);
        expect(detailsPane!.className).toMatch(/overflow-y-auto/);
        expect(generatePane!.className).toMatch(/overflow-y-auto/);
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
        expect(screen.queryByRole("textbox", { name: "Job Description" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Generate another" }));
        expect(await screen.findByRole("textbox", { name: "Job Description" })).toBeTruthy();
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

describe("Application Generate tab — watch run and manage Generated CVs", () => {
    it("shows the active run above the collapsed form with status, elapsed time, and cancel", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date("2026-07-16T10:02:00.000Z"));

        renderApplicationDetail("/applications/3/generate", {
            detailLoader: () => ({
                application,
                interviews: [],
                generations: [
                    generation({
                        status: "PENDING",
                        generatedCvId: null,
                        createdAt: "2026-07-16T10:00:00.000Z",
                        startedAt: null,
                        completedAt: null,
                    }),
                ],
            }),
            generateLoader: () =>
                generateLoaderData({
                    generations: [
                        generation({
                            status: "PENDING",
                            generatedCvId: null,
                            createdAt: "2026-07-16T10:00:00.000Z",
                            startedAt: null,
                            completedAt: null,
                        }),
                    ],
                }),
        });

        const active = await screen.findByRole("region", { name: "Active CV Generation" });
        expect(within(active).getByText("Queued")).toBeTruthy();
        expect(within(active).getByLabelText("Elapsed time").textContent).toMatch(/2m/);
        expect(within(active).getByRole("button", { name: "Cancel CV Generation" })).toBeTruthy();

        expect(
            screen.getByRole("button", { name: "Generate CV", expanded: false }),
        ).toBeTruthy();
        expect(screen.getByRole("region", { name: "Generated CVs" })).toBeTruthy();

        const pane = active.parentElement;
        expect(pane).toBeTruthy();
        const children = Array.from(pane!.children);
        expect(children[0]).toBe(active);
        expect(children[1]?.textContent).toMatch(/Generate CV/);
        expect(children[2]).toBe(screen.getByRole("region", { name: "Generated CVs" }));
    });

    it("cancels a queued CV Generation from the Generate tab", async () => {
        const submitted: Array<Record<string, FormDataEntryValue>> = [];

        renderApplicationDetail("/applications/3/generate", {
            generateLoader: () =>
                generateLoaderData({
                    generations: [
                        generation({
                            status: "PENDING",
                            generatedCvId: null,
                            completedAt: null,
                        }),
                    ],
                }),
            generateAction: async ({ request }) => {
                const formData = await request.formData();
                submitted.push(Object.fromEntries(formData.entries()));
                return { ok: true, intent: "cancel" };
            },
        });

        fireEvent.click(
            await screen.findByRole("button", { name: "Cancel CV Generation" }),
        );

        await waitFor(() => {
            expect(submitted).toHaveLength(1);
        });
        expect(submitted[0]?.intent).toBe("cancel");
        expect(submitted[0]?.cvGenerationId).toBe("10");
    });

    it("lists Generated CVs with download and delete actions", async () => {
        const openSpy = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const intents: string[] = [];

        renderApplicationDetail("/applications/3/generate", {
            generateLoader: () =>
                generateLoaderData({
                    generations: [generation()],
                    generatedCvs: [generatedCv()],
                }),
            generateAction: async ({ request }) => {
                const formData = await request.formData();
                const intent = String(formData.get("intent"));
                intents.push(intent);
                if (intent === "download-cv") {
                    return {
                        ok: true,
                        intent: "download-cv",
                        uri: "https://example.test/cv.docx",
                    };
                }
                if (intent === "delete-cv") {
                    return { ok: true, intent: "delete-cv" };
                }
                return { ok: true, intent: "create" };
            },
        });

        expect(await screen.findByText("application-3-v1.docx")).toBeTruthy();
        fireEvent.click(
            screen.getByRole("button", { name: "Download application-3-v1.docx" }),
        );
        await waitFor(() => expect(intents).toContain("download-cv"));
        await waitFor(() => expect(openSpy).toHaveBeenCalled());

        fireEvent.click(
            screen.getByRole("button", { name: "Delete application-3-v1.docx" }),
        );
        await waitFor(() => expect(intents).toContain("delete-cv"));
        expect(confirmSpy).toHaveBeenCalled();
    });

    it("shows an in-progress indicator on the Generate tab while viewing Details", async () => {
        renderApplicationDetail("/applications/3", {
            detailLoader: () => ({
                application,
                interviews: [],
                generations: [
                    generation({
                        status: "PROCESSING",
                        generatedCvId: null,
                        completedAt: null,
                    }),
                ],
            }),
            generateLoader: () =>
                generateLoaderData({
                    generations: [
                        generation({
                            status: "PROCESSING",
                            generatedCvId: null,
                            completedAt: null,
                        }),
                    ],
                }),
        });

        const generateTab = await screen.findByRole("tab", { name: /Generate/i });
        expect(generateTab.getAttribute("aria-busy")).toBe("true");
        expect(within(generateTab).getByText("in progress")).toBeTruthy();
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
    });

    it("prefetches Generate heavy data when an active run makes Generate likely", async () => {
        const generateLoader = vi.fn(() =>
            generateLoaderData({
                generations: [
                    generation({
                        status: "PROCESSING",
                        generatedCvId: null,
                        completedAt: null,
                    }),
                ],
            }),
        );

        renderApplicationDetail("/applications/3", {
            detailLoader: () => ({
                application,
                interviews: [],
                generations: [
                    generation({
                        status: "PROCESSING",
                        generatedCvId: null,
                        completedAt: null,
                    }),
                ],
            }),
            generateLoader,
        });

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        await waitFor(() => {
            expect(generateLoader).toHaveBeenCalled();
        });
        expect(screen.getByRole("tab", { name: /Details/i }).getAttribute("aria-selected")).toBe(
            "true",
        );
    });

    it("polls parent generation statuses while the dialog is open with an active run", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let detailLoads = 0;
        const detailLoader = vi.fn(() => {
            detailLoads += 1;
            return {
                application,
                interviews: [],
                generations: [
                    generation({
                        status: "PROCESSING",
                        generatedCvId: null,
                        completedAt: null,
                    }),
                ],
            };
        });

        renderApplicationDetail("/applications/3", {
            detailLoader,
            generateLoader: () =>
                generateLoaderData({
                    generations: [
                        generation({
                            status: "PROCESSING",
                            generatedCvId: null,
                            completedAt: null,
                        }),
                    ],
                }),
        });

        await screen.findByRole("dialog", { name: "Backend Engineer" });
        const initialLoads = detailLoads;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });

        await waitFor(() => {
            expect(detailLoads).toBeGreaterThan(initialLoads);
        });
    });

    it("does not show Generate data from a previous Application while switching", async () => {
        const otherApplication: Application = {
            ...application,
            applicationId: 4,
            applicationTitle: "Platform Engineer",
        };

        const router = renderApplicationDetail("/applications/3/generate", {
            applications: [application, otherApplication],
            detailLoader: ({ params }) => {
                const id = Number(params.applicationId);
                return {
                    application: id === 4 ? otherApplication : application,
                    interviews: [],
                    generations: [],
                };
            },
            generateLoader: ({ params }) => {
                const id = Number(params.applicationId);
                return generateLoaderData({
                    applicationId: id,
                    generatedCvs: [
                        generatedCv({
                            applicationId: id,
                            generatedCvId: id,
                            originalFilename: `application-${id}-v1.docx`,
                        }),
                    ],
                });
            },
        });

        expect(await screen.findByText("application-3-v1.docx")).toBeTruthy();

        await act(async () => {
            await router.navigate("/applications/4/generate", { replace: true });
        });

        expect(
            await screen.findByRole("dialog", { name: "Platform Engineer" }),
        ).toBeTruthy();
        expect(await screen.findByText("application-4-v1.docx")).toBeTruthy();
        expect(screen.queryByText("application-3-v1.docx")).toBeNull();
    });
});
