import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, type ActionFunctionArgs } from "react-router";

import { GenerateRoute } from "@/routes/GenerateRoute";
import type { GenerateActionData, GenerateLoaderData } from "@/routes/generate-data";
import {
	PREPARING_LAYOUT_STORAGE_KEY,
	writePreparingLayoutPreference,
} from "@/routes/generate-layout-preference";
import type { Application } from "@/types/application";
import type { ApplicationCv } from "@/types/application-cv";
import type { BaseCv } from "@/types/base-cv";
import type { AiConsent, CvGeneration } from "@/types/cv-generation";

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

beforeEach(() => {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverMock);
	window.localStorage.clear();
});

const company = {
	companyId: 4,
	userId: "user-1",
	global: false,
	companyName: "Northstar Labs",
	companyWebsiteUrl: "https://northstar.example",
	companyLocation: "Madrid",
	companyType: "Product",
	companyLogo: null,
	companyCreatedAt: "2026-06-24T09:00:00.000Z",
	companyUpdatedAt: "2026-07-01T12:00:00.000Z",
};

const application = (overrides: Partial<Application> = {}): Application => ({
	applicationId: 1,
	userId: "user-1",
	applicationTitle: "Frontend Engineer",
	applicationJobUrl: null,
	applicationLocation: "Madrid",
	applicationRemoteType: "HYBRID",
	applicationSource: null,
	applicationSalaryMin: null,
	applicationSalaryMax: null,
	applicationCurrency: null,
	applicationStatus: "APPLIED",
	applicationKanbanOrder: 0,
	applicationAppliedAt: null,
	applicationCreatedAt: "2026-06-25T09:15:00.000Z",
	applicationUpdatedAt: "2026-07-01T12:00:00.000Z",
	company,
	tags: [],
	...overrides,
});

const baseCv = (overrides: Partial<BaseCv> = {}): BaseCv => ({
	baseCvId: 1,
	originalFilename: "ricardo-base.pdf",
	format: "PDF",
	contentType: "application/pdf",
	byteSize: 1024,
	createdAt: "2026-07-10T09:00:00.000Z",
	...overrides,
});

const generation = (overrides: Partial<CvGeneration> = {}): CvGeneration => ({
	cvGenerationId: 10,
	applicationId: 1,
	baseCvId: 1,
	requestedFormat: "PDF",
	status: "PENDING",
	idempotencyKey: "idem-10",
	correlationId: "corr-10",
	errorCode: null,
	errorMessage: null,
	applicationCvId: null,
	modelId: null,
	workflowVersion: null,
	createdAt: "2026-07-16T10:00:00.000Z",
	updatedAt: "2026-07-16T10:00:00.000Z",
	startedAt: null,
	completedAt: null,
	statusUrl: "/api/v1/cv-generations/10",
	...overrides,
});

const applicationCv = (overrides: Partial<ApplicationCv> = {}): ApplicationCv => ({
	applicationCvId: 5,
	applicationId: 1,
	version: 1,
	originalFilename: "application-1-v1.pdf",
	format: "PDF",
	contentType: "application/pdf",
	byteSize: 2048,
	generationId: 10,
	createdAt: "2026-07-15T09:00:00.000Z",
	...overrides,
});

const consent = (overrides: Partial<AiConsent> = {}): AiConsent => ({
	consentVersion: "v1",
	consentedAt: "2026-07-01T12:00:00.000Z",
	current: true,
	...overrides,
});

const loaderData = (overrides: Partial<GenerateLoaderData> = {}): GenerateLoaderData => ({
	applications: [application()],
	baseCvs: [baseCv()],
	generations: [],
	applicationCvsByApplicationId: {},
	jobDescriptionsByApplicationId: { 1: "Prefetched job description" },
	consent: consent(),
	...overrides,
});

const renderGenerate = (
	data: GenerateLoaderData,
	action?: (args: ActionFunctionArgs) => GenerateActionData | Promise<GenerateActionData>,
) => {
	const router = createMemoryRouter(
		[
			{
				path: "/generate",
				Component: GenerateRoute,
				loader: () => data,
				action: action ?? (async () => ({ ok: true, intent: "create" }) satisfies GenerateActionData),
			},
		],
		{ initialEntries: ["/generate"] },
	);
	render(<RouterProvider router={router} />);
	return router;
};

describe("GenerateRoute", () => {
	it("renders loader applications and empty generation state", async () => {
		renderGenerate(loaderData());

		expect(await screen.findByRole("heading", { name: "Generate" })).toBeTruthy();
		expect(screen.getByText("Frontend Engineer")).toBeTruthy();
		expect(screen.getByText("No CV yet")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Generate CV for Frontend Engineer" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Expand Frontend\ Engineer(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("false");
	});

	it("presents queued, generating, completed, failed, and cancelled statuses without percentages", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Queued Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Generating Role",
						company: { ...company, companyName: "Cobalt" },
					}),
					application({
						applicationId: 3,
						applicationTitle: "Completed Role",
						company: { ...company, companyName: "Atlas" },
					}),
					application({
						applicationId: 4,
						applicationTitle: "Failed Role",
						company: { ...company, companyName: "Nova" },
					}),
					application({
						applicationId: 5,
						applicationTitle: "Cancelled Role",
						company: { ...company, companyName: "Orbit" },
					}),
				],
				generations: [
					generation({ cvGenerationId: 1, applicationId: 1, status: "PENDING" }),
					generation({ cvGenerationId: 2, applicationId: 2, status: "PROCESSING" }),
					generation({
						cvGenerationId: 3,
						applicationId: 3,
						status: "COMPLETED",
						applicationCvId: 1,
					}),
					generation({
						cvGenerationId: 4,
						applicationId: 4,
						status: "FAILED",
						errorMessage: "Model timeout",
						correlationId: "corr-failed-4",
					}),
					generation({ cvGenerationId: 5, applicationId: 5, status: "CANCELLED" }),
				],
				applicationCvsByApplicationId: {
					3: [applicationCv({ applicationId: 3, applicationCvId: 1 })],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		expect((await screen.findAllByText(/Queued/)).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/Generating/).length).toBeGreaterThan(0);
		expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
		expect(screen.getByText("Cancelled")).toBeTruthy();
		expect(screen.queryByText(/%/)).toBeNull();
		expect(screen.getByText("Model timeout")).toBeTruthy();
		expect(screen.getByText("Reference: corr-failed-4")).toBeTruthy();
		expect(screen.getByText("Updating generation status…")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Expand Completed\ Role(?: at .*)?/ }));
		expect(await screen.findByText("Completed")).toBeTruthy();
	});

	it("shows cancel only for queued generations", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Queued Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Generating Role",
						company: { ...company, companyName: "Cobalt" },
					}),
				],
				generations: [
					generation({ cvGenerationId: 1, applicationId: 1, status: "PENDING" }),
					generation({ cvGenerationId: 2, applicationId: 2, status: "PROCESSING" }),
				],
				jobDescriptionsByApplicationId: {},
			}),
		);

		expect(
			await screen.findByRole("button", { name: "Cancel generation for Queued Role" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Cancel generation for Generating Role" })).toBeNull();
	});

	it("disables generate and shows quota messaging when an application has 20 CVs", async () => {
		const cvs = Array.from({ length: 20 }, (_, index) =>
			applicationCv({
				applicationCvId: index + 1,
				version: index + 1,
				originalFilename: `application-1-v${index + 1}.pdf`,
			}),
		);
		renderGenerate(
			loaderData({
				applicationCvsByApplicationId: { 1: cvs },
			}),
		);

		fireEvent.click(await screen.findByRole("button", { name: /Expand Frontend\ Engineer(?: at .*)?/ }));
		const generateButton = await screen.findByRole("button", {
			name: "Generate CV for Frontend Engineer",
		});
		expect(generateButton.hasAttribute("disabled")).toBe(true);
		expect(screen.getByText(/Generated CV limit reached \(20 \/ 20\)/)).toBeTruthy();
	});

	it("validates required job description and consent in the dialog", async () => {
		renderGenerate(
			loaderData({
				consent: consent({ current: false, consentVersion: null, consentedAt: null }),
				jobDescriptionsByApplicationId: { 1: "" },
			}),
			async () => ({ ok: false, intent: "create", error: "unexpected" }),
		);

		fireEvent.click(await screen.findByRole("button", { name: "Generate CV for Frontend Engineer" }));
		expect(await screen.findByRole("heading", { name: "Generate CV" })).toBeTruthy();
		expect(screen.getByText(/will be sent to Google Gemini/i)).toBeTruthy();
		expect(screen.getByLabelText("Consent to send data to Google Gemini")).toBeTruthy();

		expect(screen.getByLabelText("Job Description")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Generate CV" }));
		expect(await screen.findByText("A Job Description is required.")).toBeTruthy();

		fireEvent.change(screen.getByLabelText("Job Description"), {
			target: { value: "Senior frontend role requiring React." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate CV" }));
		expect(await screen.findByText(/You must consent to sending your Base CV/i)).toBeTruthy();
	});

	it("shows pending UI while a create fetcher submission is in flight", async () => {
		const resolvers: Array<(value: GenerateActionData) => void> = [];
		renderGenerate(
			loaderData(),
			() =>
				new Promise<GenerateActionData>((resolve) => {
					resolvers.push(resolve);
				}),
		);

		fireEvent.click(await screen.findByRole("button", { name: "Generate CV for Frontend Engineer" }));
		await waitFor(() => {
			expect((screen.getByLabelText("Job Description") as HTMLTextAreaElement).value).toContain(
				"Prefetched",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Generate CV" }));
		await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
		expect(await screen.findByText("Starting…")).toBeTruthy();

		resolvers.shift()?.({ ok: true, intent: "create" });
	});

	it("downloads and deletes completed application CVs through fetchers", async () => {
		const openSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const intents: string[] = [];

		renderGenerate(
			loaderData({
				generations: [generation({ status: "COMPLETED", applicationCvId: 5 })],
				applicationCvsByApplicationId: {
					1: [applicationCv()],
				},
			}),
			async ({ request }) => {
				const formData = await request.formData();
				const intent = String(formData.get("intent"));
				intents.push(intent);
				if (intent === "download-cv") {
					return { ok: true, intent: "download-cv", uri: "https://example.test/cv.pdf" };
				}
				if (intent === "delete-cv") {
					return { ok: true, intent: "delete-cv" };
				}
				return { ok: true, intent: "create" };
			},
		);

		fireEvent.click(await screen.findByRole("button", { name: /Expand Frontend\ Engineer(?: at .*)?/ }));
		expect(await screen.findByText("Successful versions")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Download application-1-v1.pdf" }));
		await waitFor(() => expect(intents).toContain("download-cv"));
		await waitFor(() => expect(openSpy).toHaveBeenCalled());

		fireEvent.click(screen.getByRole("button", { name: "Delete application-1-v1.pdf" }));
		await waitFor(() => expect(intents).toContain("delete-cv"));
		expect(confirmSpy).toHaveBeenCalled();
	});

	it("cancels a queued generation through the cancel fetcher", async () => {
		const intents: string[] = [];
		renderGenerate(
			loaderData({
				generations: [generation({ status: "PENDING" })],
			}),
			async ({ request }) => {
				const formData = await request.formData();
				const intent = String(formData.get("intent"));
				intents.push(intent);
				if (intent === "cancel") {
					return { ok: true, intent: "cancel" };
				}
				return { ok: true, intent: "create" };
			},
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "Cancel generation for Frontend Engineer" }),
		);
		await waitFor(() => expect(intents).toContain("cancel"));
	});

	it("surfaces create action errors including quota codes", async () => {
		renderGenerate(loaderData({ jobDescriptionsByApplicationId: { 1: "Ready job description" } }), async () => ({
			ok: false,
			intent: "create",
			error: "This application already has 20 generated CVs. Delete one before generating another.",
		}));

		fireEvent.click(await screen.findByRole("button", { name: "Generate CV for Frontend Engineer" }));
		await waitFor(() => {
			expect((screen.getByLabelText("Job Description") as HTMLTextAreaElement).value).toContain(
				"Ready",
			);
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate CV" }));
		expect(await screen.findByText(/already has 20 generated CVs/i)).toBeTruthy();
	});

	it("places applications without a Generated CV in Preparing and completed work in Generated", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Untouched Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Documented Role",
						company: { ...company, companyName: "Atlas" },
					}),
				],
				generations: [
					generation({
						cvGenerationId: 2,
						applicationId: 2,
						status: "COMPLETED",
						applicationCvId: 9,
					}),
				],
				applicationCvsByApplicationId: {
					2: [applicationCv({ applicationId: 2, applicationCvId: 9 })],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		const generated = screen.getByRole("region", { name: "Generated" });
		expect(within(preparing).getByText("Untouched Role")).toBeTruthy();
		expect(within(preparing).queryByText("Documented Role")).toBeNull();
		expect(within(generated).getByText("Documented Role")).toBeTruthy();
		expect(within(generated).queryByText("Untouched Role")).toBeNull();
	});

	it("keeps active and latest-failed applications in Preparing despite older Generated CVs", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Active With Doc" }),
					application({
						applicationId: 2,
						applicationTitle: "Failed With Doc",
						company: { ...company, companyName: "Atlas" },
					}),
					application({
						applicationId: 3,
						applicationTitle: "Cancelled With Doc",
						company: { ...company, companyName: "Nova" },
					}),
					application({
						applicationId: 4,
						applicationTitle: "Cancelled Without Doc",
						company: { ...company, companyName: "Orbit" },
					}),
				],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "COMPLETED",
						applicationCvId: 11,
						createdAt: "2026-07-10T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 1,
						status: "PROCESSING",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 3,
						applicationId: 2,
						status: "COMPLETED",
						applicationCvId: 12,
						createdAt: "2026-07-10T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 4,
						applicationId: 2,
						status: "FAILED",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 5,
						applicationId: 3,
						status: "COMPLETED",
						applicationCvId: 13,
						createdAt: "2026-07-10T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 6,
						applicationId: 3,
						status: "CANCELLED",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 7,
						applicationId: 4,
						status: "CANCELLED",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
				],
				applicationCvsByApplicationId: {
					1: [applicationCv({ applicationId: 1, applicationCvId: 11 })],
					2: [applicationCv({ applicationId: 2, applicationCvId: 12 })],
					3: [applicationCv({ applicationId: 3, applicationCvId: 13 })],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		const generated = screen.getByRole("region", { name: "Generated" });
		expect(within(preparing).getByText("Active With Doc")).toBeTruthy();
		expect(within(preparing).getByText("Failed With Doc")).toBeTruthy();
		expect(within(preparing).getByText("Cancelled Without Doc")).toBeTruthy();
		expect(within(preparing).queryByText("Cancelled With Doc")).toBeNull();
		expect(within(generated).getByText("Cancelled With Doc")).toBeTruthy();
	});

	it("keeps an older active generation in Preparing even when a newer attempt already finished", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Older Active Open" }),
					application({
						applicationId: 2,
						applicationTitle: "Older Active Closed",
						applicationStatus: "REJECTED",
						company: { ...company, companyName: "Atlas" },
					}),
				],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "PROCESSING",
						createdAt: "2026-07-10T10:00:00.000Z",
						startedAt: "2026-07-10T10:01:00.000Z",
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 1,
						status: "COMPLETED",
						applicationCvId: 11,
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 3,
						applicationId: 2,
						status: "PENDING",
						createdAt: "2026-07-10T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 4,
						applicationId: 2,
						status: "FAILED",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
				],
				applicationCvsByApplicationId: {
					1: [applicationCv({ applicationId: 1, applicationCvId: 11 })],
					2: [
						applicationCv({
							applicationId: 2,
							applicationCvId: 12,
							createdAt: "2026-07-09T09:00:00.000Z",
						}),
					],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		expect(within(preparing).getByText("Older Active Open")).toBeTruthy();
		expect(within(preparing).getByText("Older Active Closed")).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Generated" })).toBeNull();
	});

	it("hides closed applications without documents while keeping documented and active ones", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationId: 1,
						applicationTitle: "Rejected Without Doc",
						applicationStatus: "REJECTED",
					}),
					application({
						applicationId: 2,
						applicationTitle: "Withdrawn Failed Without Doc",
						applicationStatus: "WITHDRAWN",
						company: { ...company, companyName: "Atlas" },
					}),
					application({
						applicationId: 3,
						applicationTitle: "Withdrawn With Doc",
						applicationStatus: "WITHDRAWN",
						company: { ...company, companyName: "Nova" },
					}),
					application({
						applicationId: 4,
						applicationTitle: "Rejected With Active Generation",
						applicationStatus: "REJECTED",
						company: { ...company, companyName: "Orbit" },
					}),
				],
				generations: [
					generation({ cvGenerationId: 1, applicationId: 2, status: "FAILED" }),
					generation({
						cvGenerationId: 2,
						applicationId: 3,
						status: "COMPLETED",
						applicationCvId: 13,
					}),
					generation({ cvGenerationId: 3, applicationId: 4, status: "PROCESSING" }),
				],
				applicationCvsByApplicationId: {
					3: [applicationCv({ applicationId: 3, applicationCvId: 13 })],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		const generated = screen.getByRole("region", { name: "Generated" });
		expect(screen.queryByText("Rejected Without Doc")).toBeNull();
		expect(screen.queryByText("Withdrawn Failed Without Doc")).toBeNull();
		expect(within(generated).getByText("Withdrawn With Doc")).toBeTruthy();
		expect(within(preparing).getByText("Rejected With Active Generation")).toBeTruthy();
	});

	it("keeps a closed application with a document in Generated even when its latest attempt failed", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationId: 1,
						applicationTitle: "Closed Failed With Doc",
						applicationStatus: "REJECTED",
					}),
				],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "COMPLETED",
						applicationCvId: 11,
						createdAt: "2026-07-10T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 1,
						status: "FAILED",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
				],
				applicationCvsByApplicationId: {
					1: [applicationCv({ applicationId: 1, applicationCvId: 11 })],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const generated = await screen.findByRole("region", { name: "Generated" });
		expect(within(generated).getByText("Closed Failed With Doc")).toBeTruthy();
		const preparing = screen.getByRole("region", { name: "Preparing" });
		expect(within(preparing).queryByText("Closed Failed With Doc")).toBeNull();
		expect(within(preparing).getByText("Nothing to prepare")).toBeTruthy();
	});

	it("orders Preparing as processing, queued, failed, then untouched with recency inside each", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationId: 1,
						applicationTitle: "Old Untouched",
						applicationUpdatedAt: "2026-07-13T08:00:00.000Z",
					}),
					application({
						applicationId: 2,
						applicationTitle: "Old Queued",
						company: { ...company, companyName: "Atlas" },
					}),
					application({
						applicationId: 3,
						applicationTitle: "New Processing",
						company: { ...company, companyName: "Nova" },
					}),
					application({
						applicationId: 4,
						applicationTitle: "Old Failed",
						company: { ...company, companyName: "Orbit" },
					}),
					application({
						applicationId: 5,
						applicationTitle: "New Untouched",
						applicationUpdatedAt: "2026-07-13T09:00:00.000Z",
						company: { ...company, companyName: "Vega" },
					}),
					application({
						applicationId: 6,
						applicationTitle: "New Queued",
						company: { ...company, companyName: "Lyra" },
					}),
					application({
						applicationId: 7,
						applicationTitle: "Old Processing",
						company: { ...company, companyName: "Cygnus" },
					}),
					application({
						applicationId: 8,
						applicationTitle: "New Failed",
						company: { ...company, companyName: "Draco" },
					}),
				],
				generations: [
					// Processing recency comes from startedAt, not createdAt.
					generation({
						cvGenerationId: 3,
						applicationId: 3,
						status: "PROCESSING",
						createdAt: "2026-07-16T04:00:00.000Z",
						startedAt: "2026-07-16T09:00:00.000Z",
					}),
					generation({
						cvGenerationId: 7,
						applicationId: 7,
						status: "PROCESSING",
						createdAt: "2026-07-16T05:00:00.000Z",
						startedAt: "2026-07-16T08:00:00.000Z",
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 2,
						status: "PENDING",
						createdAt: "2026-07-15T08:00:00.000Z",
					}),
					generation({
						cvGenerationId: 6,
						applicationId: 6,
						status: "PENDING",
						createdAt: "2026-07-15T09:00:00.000Z",
					}),
					// Failed recency comes from the terminal update, not createdAt.
					generation({
						cvGenerationId: 4,
						applicationId: 4,
						status: "FAILED",
						createdAt: "2026-07-14T05:00:00.000Z",
						updatedAt: "2026-07-14T08:00:00.000Z",
					}),
					generation({
						cvGenerationId: 8,
						applicationId: 8,
						status: "FAILED",
						createdAt: "2026-07-14T04:00:00.000Z",
						updatedAt: "2026-07-14T09:00:00.000Z",
					}),
				],
				applicationCvsByApplicationId: {},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		const rowNames = within(preparing)
			.getAllByRole("button", { name: /^(Expand|Collapse) / })
			.map((button) =>
				button.getAttribute("aria-label")?.replace(/^(Expand|Collapse) /, "").replace(/ at .*$/, ""),
			);
		expect(rowNames).toEqual([
			"New Processing",
			"Old Processing",
			"New Queued",
			"Old Queued",
			"New Failed",
			"Old Failed",
			"New Untouched",
			"Old Untouched",
		]);
	});

	it("orders Generated by newest Generated CV rather than application updates", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationId: 1,
						applicationTitle: "Recently Edited Application",
						applicationUpdatedAt: "2026-07-20T12:00:00.000Z",
					}),
					application({
						applicationId: 2,
						applicationTitle: "Newest Document Application",
						applicationUpdatedAt: "2026-07-01T12:00:00.000Z",
						company: { ...company, companyName: "Atlas" },
					}),
				],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "COMPLETED",
						applicationCvId: 11,
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 2,
						status: "COMPLETED",
						applicationCvId: 12,
					}),
				],
				applicationCvsByApplicationId: {
					1: [
						applicationCv({
							applicationId: 1,
							applicationCvId: 11,
							createdAt: "2026-07-10T09:00:00.000Z",
						}),
					],
					2: [
						applicationCv({
							applicationId: 2,
							applicationCvId: 12,
							createdAt: "2026-07-15T09:00:00.000Z",
						}),
					],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const generated = await screen.findByRole("region", { name: "Generated" });
		const rowNames = within(generated)
			.getAllByRole("button", { name: /^(Expand|Collapse) / })
			.map((button) =>
				button.getAttribute("aria-label")?.replace(/^(Expand|Collapse) /, "").replace(/ at .*$/, ""),
			);
		expect(rowNames).toEqual([
			"Newest Document Application",
			"Recently Edited Application",
		]);
	});

	it("says nothing to prepare when only generated work remains", async () => {
		renderGenerate(
			loaderData({
				applications: [application({ applicationId: 1, applicationTitle: "Documented Role" })],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "COMPLETED",
						applicationCvId: 11,
					}),
				],
				applicationCvsByApplicationId: {
					1: [applicationCv({ applicationId: 1, applicationCvId: 11 })],
				},
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		expect(within(preparing).getByText("Nothing to prepare")).toBeTruthy();
	});

	it("omits the Generated section when no application has a Generated CV", async () => {
		renderGenerate(loaderData());

		expect(await screen.findByRole("region", { name: "Preparing" })).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Generated" })).toBeNull();
	});

	it("explains that closed applications without documents are hidden when nothing is visible", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationId: 1,
						applicationTitle: "Rejected Role",
						applicationStatus: "REJECTED",
					}),
					application({
						applicationId: 2,
						applicationTitle: "Withdrawn Role",
						applicationStatus: "WITHDRAWN",
						company: { ...company, companyName: "Atlas" },
					}),
				],
				jobDescriptionsByApplicationId: {},
			}),
		);

		expect(
			await screen.findByText(/closed applications without a generated CV are hidden/i),
		).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Preparing" })).toBeNull();
		expect(screen.queryByRole("region", { name: "Generated" })).toBeNull();
		expect(screen.queryByText("Rejected Role")).toBeNull();
	});

	it("shows the empty state when there are no applications", async () => {
		renderGenerate(loaderData({ applications: [], jobDescriptionsByApplicationId: {} }));

		expect(await screen.findByText("No applications yet")).toBeTruthy();
		expect(
			screen.getByText(/Add an application on the board, then return here/i),
		).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Preparing" })).toBeNull();
	});

	it("lists successful versions with accessible download and delete controls", async () => {
		renderGenerate(
			loaderData({
				applicationCvsByApplicationId: {
					1: [
						applicationCv({
							version: 2,
							originalFilename: "application-1-v2.pdf",
							applicationCvId: 6,
						}),
						applicationCv({
							version: 1,
							originalFilename: "application-1-v1.pdf",
							applicationCvId: 5,
						}),
					],
				},
			}),
		);

		fireEvent.click(await screen.findByRole("button", { name: /Expand Frontend\ Engineer(?: at .*)?/ }));
		const list = await screen.findByText("Successful versions");
		const section = list.closest("div");
		expect(section).toBeTruthy();
		expect(within(section as HTMLElement).getByText("application-1-v2.pdf")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download application-1-v2.pdf" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete application-1-v2.pdf" })).toBeTruthy();
	});

	it("shows rich Preparing list metadata with company monogram and visible Generate", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationTitle: "Platform Engineer",
						applicationStatus: "INTERVIEW",
						applicationLocation: "Berlin",
						applicationRemoteType: "REMOTE",
						applicationUpdatedAt: "2026-07-16T12:00:00.000Z",
						company: {
							...company,
							companyName: "Northstar Labs",
							companyLogo: null,
						},
					}),
				],
				generations: [
					generation({
						status: "FAILED",
						requestedFormat: "DOCX",
						modelId: "gemini-3.1-flash-lite",
						errorMessage: "Drafting timed out",
						updatedAt: "2026-07-16T10:00:00.000Z",
					}),
				],
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		expect(within(preparing).getByText("NL")).toBeTruthy();
		expect(within(preparing).getByText("Platform Engineer")).toBeTruthy();
		expect(within(preparing).getByText("Northstar Labs")).toBeTruthy();
		expect(within(preparing).getByText("Interview")).toBeTruthy();
		expect(within(preparing).getByText("Berlin · Remote")).toBeTruthy();
		expect(within(preparing).getAllByText("Failed").length).toBeGreaterThan(0);
		expect(within(preparing).getByText(/DOCX · Gemini 3.1 Flash Lite/)).toBeTruthy();
		const activity = within(preparing).getByTitle(
			new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
				new Date("2026-07-16T10:00:00.000Z"),
			),
		);
		expect(activity.getAttribute("dateTime")).toBe("2026-07-16T10:00:00.000Z");
		expect(activity.textContent).toMatch(/ago|yesterday|today/i);
		expect(
			within(preparing).getByRole("button", { name: "Generate CV for Platform Engineer" }),
		).toBeTruthy();
		expect(
			within(preparing)
				.getByRole("button", { name: /Collapse Platform\ Engineer(?: at .*)?/ })
				.getAttribute("aria-expanded"),
		).toBe("true");
		expect(within(preparing).getByText("Drafting timed out")).toBeTruthy();
		expect(within(preparing).queryByRole("img")).toBeNull();
	});

	it("falls back to a monogram when a company logo fails to load", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						company: {
							...company,
							companyName: "Broken Image Co",
							companyLogo: "https://example.test/broken-logo.png",
						},
					}),
				],
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		const logo = preparing.querySelector("img");
		expect(logo).toBeTruthy();
		expect(logo?.getAttribute("aria-hidden")).toBe("true");
		expect(logo?.className).toContain("object-contain");
		fireEvent.error(logo!);
		expect(within(preparing).getByText("BI")).toBeTruthy();
		expect(preparing.querySelector("img")).toBeNull();
	});

	it("keeps Generated items compact until expanded and preserves Generate again plus document actions", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationId: 1,
						applicationTitle: "Settled Role",
						applicationStatus: "WITHDRAWN",
						company: { ...company, companyName: "Atlas Systems", companyLogo: null },
					}),
				],
				generations: [
					generation({
						status: "COMPLETED",
						applicationCvId: 5,
						requestedFormat: "PDF",
						modelId: "gemini-mock",
					}),
				],
				applicationCvsByApplicationId: {
					1: [
						applicationCv({
							createdAt: "2026-07-15T09:00:00.000Z",
							originalFilename: "settled-v1.pdf",
						}),
					],
				},
			}),
		);

		const generated = await screen.findByRole("region", { name: "Generated" });
		expect(within(generated).getByText("AS")).toBeTruthy();
		expect(within(generated).getByText("Settled Role")).toBeTruthy();
		expect(within(generated).getByText("1 Generated CV")).toBeTruthy();
		expect(within(generated).getByText("Withdrawn")).toBeTruthy();
		const activity = within(generated).getByTitle(
			new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
				new Date("2026-07-15T09:00:00.000Z"),
			),
		);
		expect(activity.getAttribute("dateTime")).toBe("2026-07-15T09:00:00.000Z");
		expect(
			within(generated)
				.getByRole("button", { name: /Expand Settled\ Role(?: at .*)?/ })
				.getAttribute("aria-expanded"),
		).toBe("false");
		expect(
			within(generated).queryByRole("button", { name: "Generate CV for Settled Role" }),
		).toBeNull();
		expect(within(generated).queryByText("Successful versions")).toBeNull();

		fireEvent.click(within(generated).getByRole("button", { name: /Expand Settled\ Role(?: at .*)?/ }));
		expect(
			await within(generated).findByRole("button", { name: "Generate CV for Settled Role" }),
		).toBeTruthy();
		expect(within(generated).getByText("Generate again")).toBeTruthy();
		expect(within(generated).getByText("Successful versions")).toBeTruthy();
		expect(
			within(generated).getByRole("button", { name: "Download settled-v1.pdf" }),
		).toBeTruthy();
	});

	it("expands active and failed items by default while leaving untouched items collapsed and independent", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Active Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Failed Role",
						company: { ...company, companyName: "Nova" },
					}),
					application({
						applicationId: 3,
						applicationTitle: "Untouched Role",
						company: { ...company, companyName: "Orbit" },
					}),
				],
				generations: [
					generation({ cvGenerationId: 1, applicationId: 1, status: "PROCESSING" }),
					generation({
						cvGenerationId: 2,
						applicationId: 2,
						status: "FAILED",
						errorMessage: "Provider error",
					}),
				],
				jobDescriptionsByApplicationId: {},
			}),
		);

		expect(
			(await screen.findByRole("button", { name: /Collapse Active\ Role(?: at .*)?/ })).getAttribute(
				"aria-expanded",
			),
		).toBe("true");
		expect(
			screen.getByRole("button", { name: /Collapse Failed\ Role(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("true");
		expect(
			screen.getByRole("button", { name: /Expand Untouched\ Role(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("false");
		expect(screen.getByText("Provider error")).toBeTruthy();
		expect(screen.queryByText("No generations yet")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /Expand Untouched\ Role(?: at .*)?/ }));
		expect(await screen.findByText("No generations yet")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Collapse Untouched\ Role(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("true");
		expect(
			screen.getByRole("button", { name: /Collapse Active\ Role(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("true");

		fireEvent.click(screen.getByRole("button", { name: /Collapse Active\ Role(?: at .*)?/ }));
		expect(
			screen.getByRole("button", { name: /Expand Active\ Role(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("false");
		expect(
			screen.getByRole("button", { name: /Collapse Untouched\ Role(?: at .*)?/ }).getAttribute("aria-expanded"),
		).toBe("true");
	});

	it("keeps the Generated section expanded initially and collapsible as a whole", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Documented Role" }),
				],
				generations: [
					generation({
						status: "COMPLETED",
						applicationCvId: 5,
					}),
				],
				applicationCvsByApplicationId: {
					1: [applicationCv()],
				},
			}),
		);

		const generated = await screen.findByRole("region", { name: "Generated" });
		const sectionToggle = within(generated).getByRole("button", { name: "Generated" });
		expect(sectionToggle.getAttribute("aria-expanded")).toBe("true");
		expect(within(generated).getByText("Documented Role")).toBeTruthy();

		fireEvent.click(sectionToggle);
		expect(sectionToggle.getAttribute("aria-expanded")).toBe("false");
		expect(within(generated).queryByText("Documented Role")).toBeNull();
		const controlledId = sectionToggle.getAttribute("aria-controls");
		expect(controlledId).toBeTruthy();
		expect(document.getElementById(controlledId!)).toBeTruthy();
	});

	it("shows one route-level Base CV notice and disables Generate without repeating the message", async () => {
		renderGenerate(
			loaderData({
				baseCvs: [],
				applications: [
					application({ applicationId: 1, applicationTitle: "First Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Second Role",
						company: { ...company, companyName: "Atlas" },
					}),
				],
				jobDescriptionsByApplicationId: {},
			}),
		);

		expect(
			await screen.findByText(
				"Upload a Base CV in Documents before you can generate tailored CVs.",
			),
		).toBeTruthy();
		expect(
			screen.getAllByText("Upload a Base CV in Documents before you can generate tailored CVs."),
		).toHaveLength(1);
		expect(
			screen.getByRole("button", { name: "Generate CV for First Role" }).hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen.getByRole("button", { name: "Generate CV for Second Role" }).hasAttribute("disabled"),
		).toBe(true);
	});

	it("shows Generating elapsed time from startedAt with a controlled clock", async () => {
		vi.useFakeTimers({ now: new Date("2026-07-16T10:05:00.000Z") });
		renderGenerate(
			loaderData({
				applications: [application({ applicationTitle: "Live Role" })],
				generations: [
					generation({
						status: "PROCESSING",
						createdAt: "2026-07-16T09:50:00.000Z",
						startedAt: "2026-07-16T10:00:00.000Z",
					}),
				],
			}),
		);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByText(/Generating · 5m 0s/)).toBeTruthy();
	});

	it("falls back to createdAt for Generating elapsed when startedAt is missing", async () => {
		vi.useFakeTimers({ now: new Date("2026-07-16T10:02:30.000Z") });
		renderGenerate(
			loaderData({
				generations: [
					generation({
						status: "PROCESSING",
						createdAt: "2026-07-16T10:00:00.000Z",
						startedAt: null,
					}),
				],
			}),
		);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByText(/Generating · 2m 30s/)).toBeTruthy();
	});

	it("shows Queued elapsed time from createdAt", async () => {
		vi.useFakeTimers({ now: new Date("2026-07-16T10:00:45.000Z") });
		renderGenerate(
			loaderData({
				generations: [
					generation({
						status: "PENDING",
						createdAt: "2026-07-16T10:00:00.000Z",
						startedAt: null,
					}),
				],
			}),
		);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByText(/Queued · 45s/)).toBeTruthy();
	});

	it("updates active elapsed locally each second without waiting for the 3s poll", async () => {
		vi.useFakeTimers({ now: new Date("2026-07-16T10:00:10.000Z") });
		const loader = vi.fn(() =>
			loaderData({
				generations: [
					generation({
						status: "PROCESSING",
						createdAt: "2026-07-16T10:00:00.000Z",
						startedAt: "2026-07-16T10:00:00.000Z",
					}),
				],
			}),
		);
		const router = createMemoryRouter(
			[
				{
					path: "/generate",
					Component: GenerateRoute,
					loader,
					action: async () => ({ ok: true, intent: "create" }) satisfies GenerateActionData,
				},
			],
			{ initialEntries: ["/generate"] },
		);
		render(<RouterProvider router={router} />);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByText(/Generating · 10s/)).toBeTruthy();
		const loadsAfterMount = loader.mock.calls.length;

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		expect(screen.getByText(/Generating · 11s/)).toBeTruthy();
		expect(loader.mock.calls.length).toBe(loadsAfterMount);
	});

	it("derives untouched relative time from the Application update timestamp", async () => {
		vi.useFakeTimers({ now: new Date("2026-07-16T12:00:00.000Z") });
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationTitle: "Untouched Role",
						applicationUpdatedAt: "2026-07-16T10:00:00.000Z",
					}),
				],
				generations: [],
			}),
		);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		const preparing = screen.getByRole("region", { name: "Preparing" });
		const activity = within(preparing).getByTitle(
			new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
				new Date("2026-07-16T10:00:00.000Z"),
			),
		);
		expect(activity.getAttribute("dateTime")).toBe("2026-07-16T10:00:00.000Z");
		expect(activity.textContent).toMatch(/ago|yesterday|today/i);
	});

	it("derives failed relative time from the terminal generation update", async () => {
		vi.useFakeTimers({ now: new Date("2026-07-16T12:00:00.000Z") });
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationTitle: "Failed Timing Role",
						applicationUpdatedAt: "2026-07-10T08:00:00.000Z",
					}),
				],
				generations: [
					generation({
						status: "FAILED",
						createdAt: "2026-07-16T09:00:00.000Z",
						updatedAt: "2026-07-16T11:00:00.000Z",
						errorMessage: "Drafting timed out",
					}),
				],
			}),
		);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		const preparing = screen.getByRole("region", { name: "Preparing" });
		const activity = within(preparing).getByTitle(
			new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
				new Date("2026-07-16T11:00:00.000Z"),
			),
		);
		expect(activity.getAttribute("dateTime")).toBe("2026-07-16T11:00:00.000Z");
	});

	it("humanizes known model ids, keeps unknown ids raw, and omits absent models", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Known Model Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Unknown Model Role",
						company: { ...company, companyName: "Cobalt" },
					}),
					application({
						applicationId: 3,
						applicationTitle: "No Model Role",
						company: { ...company, companyName: "Atlas" },
					}),
				],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "FAILED",
						modelId: "gemini-3.1-flash-lite",
						requestedFormat: "PDF",
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 2,
						status: "FAILED",
						modelId: "vendor-opaque-model",
						requestedFormat: "PDF",
					}),
					generation({
						cvGenerationId: 3,
						applicationId: 3,
						status: "FAILED",
						modelId: null,
						requestedFormat: "PDF",
					}),
				],
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		expect(within(preparing).getByText(/PDF · Gemini 3.1 Flash Lite/)).toBeTruthy();
		expect(within(preparing).getByText(/PDF · vendor-opaque-model/)).toBeTruthy();
		const knownMeta = within(preparing).getByText(/PDF · Gemini 3.1 Flash Lite/);
		expect(knownMeta.getAttribute("title")).toBe("gemini-3.1-flash-lite");
		const unknownMeta = within(preparing).getByText(/PDF · vendor-opaque-model/);
		expect(unknownMeta.getAttribute("title")).toBe("vendor-opaque-model");
		expect(screen.queryByText("Unknown model")).toBeNull();
		const noModelRow = within(preparing).getByText("No Model Role").closest("li");
		expect(noModelRow).toBeTruthy();
		expect(within(noModelRow as HTMLElement).getByText("PDF")).toBeTruthy();
		expect(within(noModelRow as HTMLElement).queryByText(/gemini|Model:/i)).toBeNull();
	});

	it("moves a completed generation into Generated expanded with highlight, actions, and a polite announcement", async () => {
		let current = loaderData({
			applications: [application({ applicationTitle: "Finishing Role" })],
			generations: [
				generation({
					status: "PROCESSING",
					startedAt: "2026-07-16T10:00:00.000Z",
				}),
			],
		});
		const router = createMemoryRouter(
			[
				{
					path: "/generate",
					Component: GenerateRoute,
					loader: () => current,
					action: async () => ({ ok: true, intent: "create" }) satisfies GenerateActionData,
				},
			],
			{ initialEntries: ["/generate"] },
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText(/Generating ·/)).toBeTruthy();
		expect(screen.getByRole("region", { name: "Preparing" })).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Generated" })).toBeNull();

		current = loaderData({
			applications: [application({ applicationTitle: "Finishing Role" })],
			generations: [
				generation({
					status: "COMPLETED",
					applicationCvId: 5,
					modelId: "gemini-3.1-flash-lite",
					startedAt: "2026-07-16T10:00:00.000Z",
					completedAt: "2026-07-16T10:01:00.000Z",
				}),
			],
			applicationCvsByApplicationId: {
				1: [
					applicationCv({
						originalFilename: "finishing-v1.pdf",
						createdAt: "2026-07-16T10:01:00.000Z",
					}),
				],
			},
		});
		await act(async () => {
			await router.revalidate();
		});

		const generated = await screen.findByRole("region", { name: "Generated" });
		expect(within(generated).getByText("Finishing Role")).toBeTruthy();
		expect(
			within(generated)
				.getByRole("button", { name: /Collapse Finishing\ Role(?: at .*)?/ })
				.getAttribute("aria-expanded"),
		).toBe("true");
		expect(
			within(generated).getByRole("button", { name: "Download finishing-v1.pdf" }),
		).toBeTruthy();
		expect(document.querySelector("[data-completion-highlight='true']")).toBeTruthy();
		expect(screen.getByRole("status").textContent).toMatch(/Finishing Role/i);
		expect(router.state.location.pathname).toBe("/generate");
		expect(screen.queryByRole("region", { name: "Preparing" })?.textContent).toMatch(
			/Nothing to prepare/,
		);
	});

	it("does not treat cancelling a regeneration as a completion transition", async () => {
		let current = loaderData({
			applications: [application({ applicationTitle: "Retry Role" })],
			generations: [
				generation({
					cvGenerationId: 10,
					status: "COMPLETED",
					applicationCvId: 5,
					createdAt: "2026-07-15T09:00:00.000Z",
					updatedAt: "2026-07-15T09:00:00.000Z",
				}),
				generation({
					cvGenerationId: 11,
					status: "PENDING",
					createdAt: "2026-07-16T10:00:00.000Z",
					updatedAt: "2026-07-16T10:00:00.000Z",
					startedAt: null,
				}),
			],
			applicationCvsByApplicationId: {
				1: [applicationCv({ originalFilename: "retry-v1.pdf" })],
			},
		});
		const router = createMemoryRouter(
			[
				{
					path: "/generate",
					Component: GenerateRoute,
					loader: () => current,
					action: async () => ({ ok: true, intent: "cancel" }) satisfies GenerateActionData,
				},
			],
			{ initialEntries: ["/generate"] },
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText(/Queued ·/)).toBeTruthy();
		expect(screen.getByRole("region", { name: "Preparing" })).toBeTruthy();

		current = loaderData({
			applications: [application({ applicationTitle: "Retry Role" })],
			generations: [
				generation({
					cvGenerationId: 10,
					status: "COMPLETED",
					applicationCvId: 5,
					createdAt: "2026-07-15T09:00:00.000Z",
					updatedAt: "2026-07-15T09:00:00.000Z",
				}),
				generation({
					cvGenerationId: 11,
					status: "CANCELLED",
					createdAt: "2026-07-16T10:00:00.000Z",
					updatedAt: "2026-07-16T10:01:00.000Z",
					startedAt: null,
				}),
			],
			applicationCvsByApplicationId: {
				1: [applicationCv({ originalFilename: "retry-v1.pdf" })],
			},
		});
		await act(async () => {
			await router.revalidate();
		});

		const generated = await screen.findByRole("region", { name: "Generated" });
		expect(within(generated).getByText("Retry Role")).toBeTruthy();
		expect(document.querySelector("[data-completion-highlight='true']")).toBeNull();
		expect(screen.getByRole("status").textContent ?? "").not.toMatch(/Generated CV ready/i);
	});

	it("announces completion once Generated CV rows arrive after status completes", async () => {
		let current = loaderData({
			applications: [application({ applicationTitle: "Lagging Docs Role" })],
			generations: [
				generation({
					status: "PROCESSING",
					startedAt: "2026-07-16T10:00:00.000Z",
				}),
			],
		});
		const router = createMemoryRouter(
			[
				{
					path: "/generate",
					Component: GenerateRoute,
					loader: () => current,
					action: async () => ({ ok: true, intent: "create" }) satisfies GenerateActionData,
				},
			],
			{ initialEntries: ["/generate"] },
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText(/Generating ·/)).toBeTruthy();

		current = loaderData({
			applications: [application({ applicationTitle: "Lagging Docs Role" })],
			generations: [
				generation({
					status: "COMPLETED",
					applicationCvId: 5,
					startedAt: "2026-07-16T10:00:00.000Z",
					completedAt: "2026-07-16T10:01:00.000Z",
				}),
			],
			applicationCvsByApplicationId: {},
		});
		await act(async () => {
			await router.revalidate();
		});

		expect(document.querySelector("[data-completion-highlight='true']")).toBeNull();
		expect(screen.getByRole("status").textContent ?? "").not.toMatch(/Generated CV ready/i);

		current = loaderData({
			applications: [application({ applicationTitle: "Lagging Docs Role" })],
			generations: [
				generation({
					status: "COMPLETED",
					applicationCvId: 5,
					startedAt: "2026-07-16T10:00:00.000Z",
					completedAt: "2026-07-16T10:01:00.000Z",
				}),
			],
			applicationCvsByApplicationId: {
				1: [
					applicationCv({
						originalFilename: "lagging-v1.pdf",
						createdAt: "2026-07-16T10:01:00.000Z",
					}),
				],
			},
		});
		await act(async () => {
			await router.revalidate();
		});

		const generated = await screen.findByRole("region", { name: "Generated" });
		expect(within(generated).getByText("Lagging Docs Role")).toBeTruthy();
		expect(document.querySelector("[data-completion-highlight='true']")).toBeTruthy();
		expect(screen.getByRole("status").textContent).toMatch(/Generated CV ready for Lagging Docs Role/);
		expect(
			within(generated).getByRole("button", { name: "Download lagging-v1.pdf" }),
		).toBeTruthy();
	});

	it("defaults Preparing to List when no valid saved preference exists", async () => {
		window.localStorage.setItem(PREPARING_LAYOUT_STORAGE_KEY, "columns");
		renderGenerate(loaderData());

		await screen.findByRole("heading", { name: "Generate" });
		const layoutControl = screen.getByRole("group", { name: "Preparing layout" });
		expect(
			within(layoutControl).getByRole("button", { name: "List" }).getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			within(layoutControl).getByRole("button", { name: "Grid" }).getAttribute("aria-pressed"),
		).toBe("false");
		expect(screen.getByRole("region", { name: "Preparing" }).getAttribute("data-layout")).toBe(
			"list",
		);
	});

	it("persists Preparing Grid locally and restores it on a later route visit", async () => {
		const data = loaderData({
			applications: [
				application({ applicationId: 1, applicationTitle: "Untouched Role" }),
				application({
					applicationId: 2,
					applicationTitle: "Documented Role",
					company: { ...company, companyName: "Atlas" },
				}),
			],
			generations: [
				generation({
					cvGenerationId: 20,
					applicationId: 2,
					status: "COMPLETED",
					applicationCvId: 5,
				}),
			],
			applicationCvsByApplicationId: {
				2: [applicationCv({ applicationId: 2 })],
			},
			jobDescriptionsByApplicationId: {},
		});

		renderGenerate(data);

		await screen.findByRole("heading", { name: "Generate" });
		fireEvent.click(screen.getByRole("button", { name: "Grid" }));

		const layoutControl = screen.getByRole("group", { name: "Preparing layout" });
		expect(
			within(layoutControl).getByRole("button", { name: "Grid" }).getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getByRole("region", { name: "Preparing" }).getAttribute("data-layout")).toBe(
			"grid",
		);
		expect(window.localStorage.getItem(PREPARING_LAYOUT_STORAGE_KEY)).toBe("grid");
		expect(window.location.search).toBe("");

		cleanup();
		const router = renderGenerate(data);

		await screen.findByRole("heading", { name: "Generate" });
		expect(
			within(screen.getByRole("group", { name: "Preparing layout" }))
				.getByRole("button", { name: "Grid" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getByRole("region", { name: "Preparing" }).getAttribute("data-layout")).toBe(
			"grid",
		);
		expect(screen.getByRole("region", { name: "Generated" }).getAttribute("data-layout")).toBe(
			"list",
		);
		expect(router.state.location.pathname).toBe("/generate");
		expect(router.state.location.search).toBe("");
	});

	it("shows crucial collapsed Grid fields and reveals List-parity details when expanded", async () => {
		writePreparingLayoutPreference("grid");
		renderGenerate(
			loaderData({
				applications: [
					application({
						applicationTitle: "Platform Engineer",
						applicationStatus: "INTERVIEW",
						applicationLocation: "Berlin",
						applicationRemoteType: "REMOTE",
						applicationUpdatedAt: "2026-07-16T12:00:00.000Z",
						company: { ...company, companyName: "Northstar Labs", companyLogo: null },
					}),
				],
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		expect(preparing.getAttribute("data-layout")).toBe("grid");
		expect(within(preparing).getByText("NL")).toBeTruthy();
		expect(within(preparing).getByText("Platform Engineer")).toBeTruthy();
		expect(within(preparing).getByText("No CV yet")).toBeTruthy();
		const activity = within(preparing).getByTitle(
			new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
				new Date("2026-07-16T12:00:00.000Z"),
			),
		);
		expect(activity.getAttribute("dateTime")).toBe("2026-07-16T12:00:00.000Z");
		expect(
			within(preparing).getByRole("button", { name: "Generate CV for Platform Engineer" }),
		).toBeTruthy();
		expect(within(preparing).getByText("Interview")).toBeTruthy();
		expect(within(preparing).queryByText("Berlin · Remote")).toBeNull();
		expect(within(preparing).queryByText("Northstar Labs")).toBeNull();

		fireEvent.click(
			within(preparing).getByRole("button", { name: /Expand Platform\ Engineer(?: at .*)?/ }),
		);
		expect(
			await within(preparing).findByRole("button", {
				name: /Collapse Platform\ Engineer(?: at .*)?/,
			}),
		).toBeTruthy();
		expect(within(preparing).getByText("Northstar Labs")).toBeTruthy();
		expect(within(preparing).getByText("Berlin · Remote")).toBeTruthy();
		expect(within(preparing).getByText("No generations yet")).toBeTruthy();
	});

	it("keeps live active indicators on Grid cards without Generate", async () => {
		writePreparingLayoutPreference("grid");
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationTitle: "Queued Role" }),
					application({
						applicationId: 2,
						applicationTitle: "Generating Role",
						company: { ...company, companyName: "Orbit" },
					}),
				],
				generations: [
					generation({
						cvGenerationId: 1,
						applicationId: 1,
						status: "PENDING",
						createdAt: "2026-07-16T10:00:00.000Z",
					}),
					generation({
						cvGenerationId: 2,
						applicationId: 2,
						status: "PROCESSING",
						startedAt: "2026-07-16T10:00:00.000Z",
						createdAt: "2026-07-16T09:59:00.000Z",
					}),
				],
				jobDescriptionsByApplicationId: {},
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		expect(preparing.getAttribute("data-layout")).toBe("grid");
		fireEvent.click(
			within(preparing).getByRole("button", { name: /Collapse Queued\ Role(?: at .*)?/ }),
		);
		fireEvent.click(
			within(preparing).getByRole("button", { name: /Collapse Generating\ Role(?: at .*)?/ }),
		);
		const indicatorText = (label: string) => (content: string, element: Element | null) =>
			Boolean(element && element.tagName === "SPAN" && content.startsWith(label) && content.includes("·"));
		expect(within(preparing).getByText(indicatorText("Queued"))).toBeTruthy();
		expect(within(preparing).getByText(indicatorText("Generating"))).toBeTruthy();
		expect(
			within(preparing).queryByRole("button", { name: "Generate CV for Queued Role" }),
		).toBeNull();
		expect(
			within(preparing).queryByRole("button", { name: "Generate CV for Generating Role" }),
		).toBeNull();
	});

	it("preserves disclosure state when switching Preparing layouts", async () => {
		renderGenerate(
			loaderData({
				applications: [
					application({ applicationId: 1, applicationTitle: "Untouched Role" }),
				],
			}),
		);

		const preparing = await screen.findByRole("region", { name: "Preparing" });
		fireEvent.click(
			within(preparing).getByRole("button", { name: /Expand Untouched\ Role(?: at .*)?/ }),
		);
		expect(await within(preparing).findByText("No generations yet")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Grid" }));
		expect(screen.getByRole("region", { name: "Preparing" }).getAttribute("data-layout")).toBe(
			"grid",
		);
		expect(
			within(screen.getByRole("region", { name: "Preparing" }))
				.getByRole("button", { name: /Collapse Untouched\ Role(?: at .*)?/ })
				.getAttribute("aria-expanded"),
		).toBe("true");
		expect(within(screen.getByRole("region", { name: "Preparing" })).getByText("No generations yet")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "List" }));
		expect(
			within(screen.getByRole("region", { name: "Preparing" }))
				.getByRole("button", { name: /Collapse Untouched\ Role(?: at .*)?/ })
				.getAttribute("aria-expanded"),
		).toBe("true");
	});
});
