import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";

vi.hoisted(() => {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverMock);
	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockImplementation(() => ({
			matches: false,
			media: "",
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	);
});

import { KanbanRoute } from "@/routes/KanbanRoute";
import { ApplicationDetailRoute } from "@/routes/ApplicationDetailRoute";
import type { BoardGenerationReminder } from "@/lib/board-generation-reminders";
import { isTerminalCvGenerationAcknowledged } from "@/lib/generation-terminal-ack";
import type { Application } from "@/types/application";
import type { CvGeneration } from "@/types/cv-generation";
import type { User } from "@/types/user";

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

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.useRealTimers();
});

const renderKanban = (options?: {
	reminders?: BoardGenerationReminder[];
	kanbanLoader?: () =>
		| {
				applications: Application[];
				tags: [];
				generationReminders: BoardGenerationReminder[];
		  }
		| Promise<{
				applications: Application[];
				tags: [];
				generationReminders: BoardGenerationReminder[];
		  }>;
	detailGenerations?: CvGeneration[];
	initialEntry?: string;
}) => {
	const reminders = options?.reminders ?? [];
	const baseKanbanLoader =
		options?.kanbanLoader ??
		(() => ({
			applications: [application],
			tags: [] as [],
			generationReminders: reminders,
		}));
	let kanbanLoaderCalls = 0;
	const countedKanbanLoader = async () => {
		kanbanLoaderCalls += 1;
		return baseKanbanLoader();
	};

	const router = createMemoryRouter(
		[
			{
				id: "app",
				path: "/",
				loader: () => ({ user }),
				Component: Outlet,
				children: [
					{
						id: "kanban",
						Component: KanbanRoute,
						loader: countedKanbanLoader,
						children: [
							{ index: true },
							{
								path: "applications/:applicationId",
								Component: ApplicationDetailRoute,
								loader: () => ({
									application,
									interviews: [],
									generations: options?.detailGenerations ?? [],
								}),
								children: [
									{ index: true },
									{
										id: "application-generate",
										path: "generate",
										loader: () => ({
											applicationId: 3,
											baseCvs: [],
											consent: {
												consentVersion: "v1",
												consentedAt: "2026-07-01T12:00:00.000Z",
												current: true,
											},
											jobDescription: "",
											generations: options?.detailGenerations ?? [],
											generatedCvs: [],
										}),
									},
								],
							},
						],
					},
				],
			},
		],
		{
			initialEntries: [options?.initialEntry ?? "/"],
		},
	);

	render(<RouterProvider router={router} />);
	return {
		router,
		getKanbanLoaderCalls: () => kanbanLoaderCalls,
	};
};

describe("Kanban card generation signifiers", () => {
	it("shows generating while a CV Generation is active", async () => {
		renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: true,
					terminalOutcome: null,
				},
			],
		});

		expect(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generating",
			}),
		).toBeTruthy();
		expect(screen.getByRole("status", { name: "CV generating" })).toBeTruthy();
	});

	it("shows success for unacknowledged COMPLETED", async () => {
		renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: false,
					terminalOutcome: { cvGenerationId: 10, status: "COMPLETED" },
				},
			],
		});

		expect(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation succeeded",
			}),
		).toBeTruthy();
	});

	it("shows failed for unacknowledged FAILED", async () => {
		renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: false,
					terminalOutcome: { cvGenerationId: 10, status: "FAILED" },
				},
			],
		});

		expect(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation failed",
			}),
		).toBeTruthy();
	});

	it("shows no signifier when the latest terminal outcome is only CANCELLED", async () => {
		renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: false,
					terminalOutcome: null,
				},
			],
		});

		expect(
			await screen.findByRole("link", { name: "Acme, Backend Engineer" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("status", { name: /CV generat/i }),
		).toBeNull();
	});

	it("opens Generate when generating or failed signifiers are present", async () => {
		const { router } = renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: true,
					terminalOutcome: null,
				},
			],
		});

		fireEvent.click(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generating",
			}),
		);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/applications/3/generate");
		});
	});

	it("opens Generate for an unacknowledged failed signifier", async () => {
		const { router } = renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: false,
					terminalOutcome: { cvGenerationId: 10, status: "FAILED" },
				},
			],
			detailGenerations: [generation({ status: "FAILED", generatedCvId: null })],
		});

		fireEvent.click(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation failed",
			}),
		);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/applications/3/generate");
		});
	});

	it("opens Generate when a signifier is present", async () => {
		const { router } = renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: false,
					terminalOutcome: { cvGenerationId: 10, status: "COMPLETED" },
				},
			],
			detailGenerations: [generation()],
		});

		fireEvent.click(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation succeeded",
			}),
		);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/applications/3/generate");
		});
	});

	it("opens Details when the card has no generation signifier", async () => {
		const { router } = renderKanban({ reminders: [] });

		fireEvent.click(
			await screen.findByRole("link", { name: "Acme, Backend Engineer" }),
		);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/applications/3");
		});
	});

	it("clears success after opening Generate", async () => {
		const { router } = renderKanban({
			reminders: [
				{
					applicationId: 3,
					active: false,
					terminalOutcome: { cvGenerationId: 10, status: "COMPLETED" },
				},
			],
			detailGenerations: [generation()],
		});

		fireEvent.click(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation succeeded",
			}),
		);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/applications/3/generate");
			expect(isTerminalCvGenerationAcknowledged(3, 10)).toBe(true);
		});

		const dialog = screen.getByRole("dialog");
		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/");
		});

		expect(
			screen.getByRole("link", { name: "Acme, Backend Engineer" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("status", { name: "CV generation succeeded" }),
		).toBeNull();
	});

	it("shows a later terminal outcome after a previous one was acknowledged", async () => {
		const { router, getKanbanLoaderCalls } = renderKanban({
			kanbanLoader: () => ({
				applications: [application],
				tags: [],
				generationReminders: [
					{
						applicationId: 3,
						active: false,
						terminalOutcome: {
							cvGenerationId: isTerminalCvGenerationAcknowledged(3, 10)
								? 22
								: 10,
							status: "COMPLETED",
						},
					},
				],
			}),
			detailGenerations: [generation()],
		});

		fireEvent.click(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation succeeded",
			}),
		);
		await waitFor(() => {
			expect(isTerminalCvGenerationAcknowledged(3, 10)).toBe(true);
		});

		const dialog = screen.getByRole("dialog");
		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/");
		});

		const callsBefore = getKanbanLoaderCalls();
		await act(async () => {
			await router.revalidate();
		});
		await waitFor(() => {
			expect(getKanbanLoaderCalls()).toBeGreaterThan(callsBefore);
		});

		expect(
			await screen.findByRole("link", {
				name: "Acme, Backend Engineer, CV generation succeeded",
			}),
		).toBeTruthy();
		expect(screen.getByRole("status", { name: "CV generation succeeded" })).toBeTruthy();
	});

	it("polls the board loader while any Application has an active CV Generation", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let active = true;
		const { getKanbanLoaderCalls } = renderKanban({
			kanbanLoader: () => ({
				applications: [application],
				tags: [],
				generationReminders: [
					{
						applicationId: 3,
						active,
						terminalOutcome: null,
					},
				],
			}),
		});

		await screen.findByRole("link", {
			name: "Acme, Backend Engineer, CV generating",
		});
		const callsBefore = getKanbanLoaderCalls();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(3_000);
		});

		await waitFor(() => {
			expect(getKanbanLoaderCalls()).toBeGreaterThan(callsBefore);
		});

		active = false;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(3_000);
		});
		const callsAfterInactive = getKanbanLoaderCalls();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(3_000);
		});

		expect(getKanbanLoaderCalls()).toBe(callsAfterInactive);
	});
});
