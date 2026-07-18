import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, type ActionFunctionArgs } from "react-router";

import { GenerateRoute } from "@/routes/GenerateRoute";
import type { GenerateActionData, GenerateLoaderData } from "@/routes/generate-data";
import type { Application } from "@/types/application";
import type { ApplicationCv } from "@/types/application-cv";
import type { BaseCv } from "@/types/base-cv";
import type { AiConsent, CvGeneration } from "@/types/cv-generation";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

beforeEach(() => {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
				action:
					action ??
					(async () =>
						({
							ok: true,
							intent: "job-description",
							applicationId: 1,
							jobDescriptionText: "Prefetched job description",
						}) satisfies GenerateActionData),
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
		expect(screen.getByText("No generations yet")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Generate CV for Frontend Engineer" })).toBeTruthy();
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
					}),
					generation({ cvGenerationId: 5, applicationId: 5, status: "CANCELLED" }),
				],
				applicationCvsByApplicationId: {
					3: [applicationCv({ applicationId: 3, applicationCvId: 1 })],
				},
			}),
		);

		expect(await screen.findByText("Queued")).toBeTruthy();
		expect(screen.getByText("Generating")).toBeTruthy();
		expect(screen.getByText("Completed")).toBeTruthy();
		expect(screen.getByText("Failed")).toBeTruthy();
		expect(screen.getByText("Cancelled")).toBeTruthy();
		expect(screen.queryByText(/%/)).toBeNull();
		expect(screen.getByText("Model timeout")).toBeTruthy();
		expect(screen.getByText("Updating generation status…")).toBeTruthy();
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
			}),
			async ({ request }) => {
				const formData = await request.formData();
				const intent = String(formData.get("intent"));
				if (intent === "job-description") {
					return {
						ok: true,
						intent: "job-description",
						applicationId: 1,
						jobDescriptionText: "",
					};
				}
				return { ok: false, intent: "create", error: "unexpected" };
			},
		);

		fireEvent.click(await screen.findByRole("button", { name: "Generate CV for Frontend Engineer" }));
		expect(await screen.findByRole("heading", { name: "Generate CV" })).toBeTruthy();
		expect(screen.getByText(/will be sent to Google Gemini/i)).toBeTruthy();
		expect(screen.getByLabelText("Consent to send data to Google Gemini")).toBeTruthy();

		await waitFor(() => {
			expect(screen.getByLabelText("Job Description")).toBeTruthy();
		});

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
		await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));

		resolvers.shift()?.({
			ok: true,
			intent: "job-description",
			applicationId: 1,
			jobDescriptionText: "Prefetched job description",
		});

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
				return { ok: true, intent: "job-description", applicationId: 1, jobDescriptionText: "" };
			},
		);

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
				return { ok: true, intent: "job-description", applicationId: 1, jobDescriptionText: "" };
			},
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "Cancel generation for Frontend Engineer" }),
		);
		await waitFor(() => expect(intents).toContain("cancel"));
	});

	it("surfaces create action errors including quota codes", async () => {
		renderGenerate(loaderData(), async ({ request }) => {
			const formData = await request.formData();
			const intent = String(formData.get("intent"));
			if (intent === "job-description") {
				return {
					ok: true,
					intent: "job-description",
					applicationId: 1,
					jobDescriptionText: "Ready job description",
				};
			}
			return {
				ok: false,
				intent: "create",
				error:
					"This application already has 20 generated CVs. Delete one before generating another.",
			};
		});

		fireEvent.click(await screen.findByRole("button", { name: "Generate CV for Frontend Engineer" }));
		await waitFor(() => {
			expect((screen.getByLabelText("Job Description") as HTMLTextAreaElement).value).toContain(
				"Ready",
			);
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate CV" }));
		expect(await screen.findByText(/already has 20 generated CVs/i)).toBeTruthy();
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

		const list = await screen.findByText("Successful versions");
		const section = list.closest("div");
		expect(section).toBeTruthy();
		expect(within(section as HTMLElement).getByText("application-1-v2.pdf")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download application-1-v2.pdf" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete application-1-v2.pdf" })).toBeTruthy();
	});
});
