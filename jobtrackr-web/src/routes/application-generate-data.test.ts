import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { api, ApiError, clearAccessToken, setAccessToken } from "@/lib/api";
import {
	applicationGenerateAction,
	applicationGenerateLoader,
} from "@/routes/application-generate-data";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCv } from "@/types/generated-cv";
import type { AiConsent, CvGeneration } from "@/types/cv-generation";

afterEach(() => {
	clearAccessToken();
	vi.restoreAllMocks();
});

const baseCv: BaseCv = {
	baseCvId: 1,
	originalFilename: "ricardo-base.pdf",
	format: "PDF",
	contentType: "application/pdf",
	byteSize: 1024,
	createdAt: "2026-07-10T09:00:00.000Z",
};

const consent: AiConsent = {
	consentVersion: "v1",
	consentedAt: "2026-07-01T12:00:00.000Z",
	current: true,
};

const generation: CvGeneration = {
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
};

const generatedCv: GeneratedCv = {
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
};

function loaderArgs(
	applicationId: string | undefined,
): LoaderFunctionArgs {
	return {
		params: { applicationId },
		request: new Request("http://localhost/applications/3/generate"),
		context: {},
	} as unknown as LoaderFunctionArgs;
}

describe("applicationGenerateLoader", () => {
	it("loads Base CVs, consent, job description, generations, and Generated CVs for one Application", async () => {
		setAccessToken("test-token");
		const getBaseCvs = vi.spyOn(api, "getBaseCvs").mockResolvedValue([baseCv]);
		const getAiConsent = vi.spyOn(api, "getAiConsent").mockResolvedValue(consent);
		const getJobDescription = vi
			.spyOn(api, "getJobDescription")
			.mockResolvedValue({
				applicationId: 3,
				jobDescriptionText: "Build APIs",
			});
		const getCvGenerations = vi
			.spyOn(api, "getCvGenerations")
			.mockResolvedValue([generation]);
		const getGeneratedCvs = vi
			.spyOn(api, "getGeneratedCvs")
			.mockResolvedValue([generatedCv]);

		const data = await applicationGenerateLoader(loaderArgs("3"));

		expect(data).toEqual({
			applicationId: 3,
			baseCvs: [baseCv],
			consent,
			jobDescription: "Build APIs",
			generations: [generation],
			generatedCvs: [generatedCv],
		});
		expect(getBaseCvs).toHaveBeenCalledOnce();
		expect(getAiConsent).toHaveBeenCalledOnce();
		expect(getJobDescription).toHaveBeenCalledWith(3);
		expect(getCvGenerations).toHaveBeenCalledWith(3);
		expect(getGeneratedCvs).toHaveBeenCalledWith(3);
	});

	it("treats a missing job description as an empty string", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "getBaseCvs").mockResolvedValue([]);
		vi.spyOn(api, "getAiConsent").mockResolvedValue(consent);
		vi.spyOn(api, "getJobDescription").mockRejectedValue(
			new ApiError("Not found", 404, "APPLICATION_NOT_FOUND"),
		);
		vi.spyOn(api, "getCvGenerations").mockResolvedValue([]);
		vi.spyOn(api, "getGeneratedCvs").mockResolvedValue([]);

		const data = await applicationGenerateLoader(loaderArgs("3"));

		expect(data.jobDescription).toBe("");
	});

	it("rejects an invalid Application id", async () => {
		setAccessToken("test-token");

		await expect(applicationGenerateLoader(loaderArgs("nope"))).rejects.toMatchObject({
			status: 400,
		});
	});
});

function createFormData(fields: Record<string, string>) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		formData.set(key, value);
	}
	return formData;
}

function actionArgs(
	applicationId: string,
	formData: FormData,
): ActionFunctionArgs {
	return {
		params: { applicationId },
		request: new Request("http://localhost/applications/3/generate", {
			method: "POST",
			body: formData,
		}),
		context: {},
	} as unknown as ActionFunctionArgs;
}

describe("applicationGenerateAction", () => {
	it("creates a CV Generation for the route Application id", async () => {
		setAccessToken("test-token");
		const createCvGeneration = vi
			.spyOn(api, "createCvGeneration")
			.mockResolvedValue(generation);

		const result = await applicationGenerateAction(
			actionArgs(
				"3",
				createFormData({
					intent: "create",
					baseCvId: "1",
					format: "DOCX",
					jobDescription: "Build APIs",
					additionalInformation: "Emphasize backend",
					consentAccepted: "true",
				}),
			),
		);

		expect(result).toEqual({ ok: true, intent: "create" });
		expect(createCvGeneration).toHaveBeenCalledWith(
			{
				applicationId: 3,
				baseCvId: 1,
				format: "DOCX",
				jobDescription: "Build APIs",
				additionalInformation: "Emphasize backend",
				consentAccepted: true,
			},
			expect.any(String),
		);
	});

	it("returns field errors for missing Base CV and Job Description", async () => {
		setAccessToken("test-token");
		const createCvGeneration = vi.spyOn(api, "createCvGeneration");

		const result = await applicationGenerateAction(
			actionArgs(
				"3",
				createFormData({
					intent: "create",
					baseCvId: "",
					format: "DOCX",
					jobDescription: "   ",
					consentAccepted: "true",
				}),
			),
		);

		expect(result).toEqual({
			ok: false,
			intent: "create",
			error: "Check the highlighted fields.",
			fieldErrors: {
				baseCvId: "Choose a Base CV.",
				jobDescription: "A Job Description is required.",
			},
		});
		expect(createCvGeneration).not.toHaveBeenCalled();
	});

	it("maps consent and limit API errors to clear messages", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "createCvGeneration").mockRejectedValue(
			new ApiError("Consent required", 400, "AI_CONSENT_REQUIRED"),
		);

		const consentResult = await applicationGenerateAction(
			actionArgs(
				"3",
				createFormData({
					intent: "create",
					baseCvId: "1",
					format: "PDF",
					jobDescription: "Build APIs",
					consentAccepted: "false",
				}),
			),
		);

		expect(consentResult).toEqual({
			ok: false,
			intent: "create",
			error:
				"You must consent to sending your Base CV, Job Description, and additional information to Google Gemini.",
		});

		vi.spyOn(api, "createCvGeneration").mockRejectedValue(
			new ApiError("Limit", 409, "GENERATION_LIMIT_REACHED"),
		);

		const limitResult = await applicationGenerateAction(
			actionArgs(
				"3",
				createFormData({
					intent: "create",
					baseCvId: "1",
					format: "PDF",
					jobDescription: "Build APIs",
					consentAccepted: "true",
				}),
			),
		);

		expect(limitResult).toEqual({
			ok: false,
			intent: "create",
			error:
				"This application already has 20 generated CVs. Delete one before generating another.",
		});
	});

	it("scopes create to the route Application id, ignoring a forged form applicationId", async () => {
		setAccessToken("test-token");
		const createCvGeneration = vi
			.spyOn(api, "createCvGeneration")
			.mockResolvedValue(generation);

		await applicationGenerateAction(
			actionArgs(
				"3",
				createFormData({
					intent: "create",
					applicationId: "999",
					baseCvId: "1",
					format: "MARKDOWN",
					jobDescription: "Build APIs",
					consentAccepted: "true",
				}),
			),
		);

		expect(createCvGeneration.mock.calls[0]?.[0].applicationId).toBe(3);
	});
});
