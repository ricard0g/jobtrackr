import type { ActionFunctionArgs } from "react-router";

import { api, ApiError, requireSession } from "@/lib/api";
import type { Application } from "@/types/application";
import type { ApplicationCv } from "@/types/application-cv";
import type { BaseCv } from "@/types/base-cv";
import type {
	AiConsent,
	CvGeneration,
	GeneratedCvFormat,
} from "@/types/cv-generation";

export const MAX_APPLICATION_CVS = 20;
export const MAX_JOB_DESCRIPTION_CHARS = 50_000;
export const MAX_ADDITIONAL_INFO_CHARS = 5_000;

export type GenerateLoaderData = {
	applications: Application[];
	baseCvs: BaseCv[];
	generations: CvGeneration[];
	applicationCvsByApplicationId: Record<number, ApplicationCv[]>;
	jobDescriptionsByApplicationId: Record<number, string>;
	consent: AiConsent;
};

export type GenerateActionIntent = "create" | "cancel" | "delete-cv" | "download-cv";

export type GenerateActionData = {
	ok: boolean;
	intent: GenerateActionIntent;
	error?: string;
	fieldErrors?: Partial<
		Record<"baseCvId" | "format" | "jobDescription" | "additionalInformation" | "consentAccepted", string>
	>;
	uri?: string;
};

const generatedFormats: GeneratedCvFormat[] = ["PDF", "DOCX", "MARKDOWN"];

const isGeneratedFormat = (value: string): value is GeneratedCvFormat =>
	generatedFormats.includes(value as GeneratedCvFormat);

const errorMessages: Record<string, string> = {
	MISSING_JOB_DESCRIPTION: "A Job Description is required to generate a CV.",
	JOB_DESCRIPTION_TOO_LONG: "Job Description must not exceed 50,000 characters.",
	ADDITIONAL_INFORMATION_TOO_LONG: "Additional information must not exceed 5,000 characters.",
	INVALID_GENERATION_FORMAT: "Choose PDF, DOCX, or Markdown as the output format.",
	BASE_CV_UNAVAILABLE: "The selected Base CV is unavailable. Choose another document.",
	BASE_CV_IN_USE: "This Base CV is in use by an active generation and cannot be changed right now.",
	AI_CONSENT_REQUIRED:
		"You must consent to sending your Base CV, Job Description, and additional information to Google Gemini.",
	GENERATION_LIMIT_REACHED:
		"This application already has 20 generated CVs. Delete one before generating another.",
	CV_GENERATION_NOT_FOUND: "This generation is no longer available.",
	INVALID_STATUS_TRANSITION: "Only queued generations can be cancelled.",
	MISSING_IDEMPOTENCY_KEY: "The generation request could not be started. Please try again.",
	APPLICATION_CV_NOT_FOUND: "This generated CV is no longer available.",
	STORAGE_UNAVAILABLE: "Document storage is temporarily unavailable. Please try again.",
	APPLICATION_NOT_FOUND: "This application is no longer available.",
};

const actionError = (
	intent: GenerateActionIntent,
	error: unknown,
	extras: Partial<GenerateActionData> = {},
): GenerateActionData => {
	if (error instanceof ApiError) {
		return {
			ok: false,
			intent,
			error: (error.code && errorMessages[error.code]) || error.message,
			fieldErrors: error.fieldErrors
				? Object.fromEntries(
						Object.entries(error.fieldErrors).filter(([field]) =>
							[
								"baseCvId",
								"format",
								"jobDescription",
								"additionalInformation",
								"consentAccepted",
							].includes(field),
						),
					)
				: undefined,
			...extras,
		};
	}
	return {
		ok: false,
		intent,
		error: error instanceof Error ? error.message : "The operation could not be completed.",
		...extras,
	};
};

export async function generateLoader(): Promise<GenerateLoaderData> {
	await requireSession();

	const [applications, baseCvs, generations, consent] = await Promise.all([
		api.getApplications(),
		api.getBaseCvs(),
		api.getCvGenerations(),
		api.getAiConsent(),
	]);

	const applicationIds = [
		...new Set(
			generations
				.filter((generation) => {
					const knownApplication = applications.some(
						(application) => application.applicationId === generation.applicationId,
					);
					return (
						knownApplication &&
						(generation.status === "COMPLETED" || generation.applicationCvId != null)
					);
				})
				.map((generation) => generation.applicationId),
		),
	];

	const [applicationCvsEntries, jobDescriptionEntries] = await Promise.all([
		Promise.all(
			applicationIds.map(async (applicationId) => {
				try {
					const applicationCvs = await api.getApplicationCvs(applicationId);
					return [applicationId, applicationCvs] as const;
				} catch (error) {
					if (error instanceof ApiError && error.status === 404) {
						return [applicationId, []] as const;
					}
					throw error;
				}
			}),
		),
		Promise.all(
			applications.map(async (application) => {
				try {
					const response = await api.getJobDescription(application.applicationId);
					return [application.applicationId, response.jobDescriptionText ?? ""] as const;
				} catch (error) {
					if (error instanceof ApiError && error.status === 404) {
						return [application.applicationId, ""] as const;
					}
					throw error;
				}
			}),
		),
	]);

	return {
		applications,
		baseCvs,
		generations,
		applicationCvsByApplicationId: Object.fromEntries(applicationCvsEntries),
		jobDescriptionsByApplicationId: Object.fromEntries(jobDescriptionEntries),
		consent,
	};
}

export async function generateAction({ request }: ActionFunctionArgs): Promise<GenerateActionData> {
	await requireSession();
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "") as GenerateActionIntent | "";

	try {
		if (intent === "create") {
			const applicationId = Number(formData.get("applicationId"));
			const baseCvId = Number(formData.get("baseCvId"));
			const formatValue = String(formData.get("format") ?? "");
			const jobDescription = String(formData.get("jobDescription") ?? "");
			const additionalInformation = String(formData.get("additionalInformation") ?? "");
			const consentAccepted = formData.get("consentAccepted") === "true";

			const fieldErrors: GenerateActionData["fieldErrors"] = {};
			if (!Number.isInteger(applicationId) || applicationId <= 0) {
				return { ok: false, intent, error: "Invalid application." };
			}
			if (!Number.isInteger(baseCvId) || baseCvId <= 0) {
				fieldErrors.baseCvId = "Choose a Base CV.";
			}
			if (!isGeneratedFormat(formatValue)) {
				fieldErrors.format = "Choose PDF, DOCX, or Markdown.";
			}
			if (!jobDescription.trim()) {
				fieldErrors.jobDescription = "A Job Description is required.";
			} else if (jobDescription.length > MAX_JOB_DESCRIPTION_CHARS) {
				fieldErrors.jobDescription = errorMessages.JOB_DESCRIPTION_TOO_LONG;
			}
			if (additionalInformation.length > MAX_ADDITIONAL_INFO_CHARS) {
				fieldErrors.additionalInformation = errorMessages.ADDITIONAL_INFORMATION_TOO_LONG;
			}
			if (Object.keys(fieldErrors).length > 0) {
				return { ok: false, intent, fieldErrors, error: "Check the highlighted fields." };
			}

			await api.createCvGeneration(
				{
					applicationId,
					baseCvId,
					format: formatValue as GeneratedCvFormat,
					jobDescription: jobDescription.trim(),
					additionalInformation: additionalInformation.trim() || null,
					consentAccepted,
				},
				crypto.randomUUID(),
			);
			return { ok: true, intent };
		}

		if (intent === "cancel") {
			const cvGenerationId = Number(formData.get("cvGenerationId"));
			if (!Number.isInteger(cvGenerationId) || cvGenerationId <= 0) {
				return { ok: false, intent, error: "Invalid generation." };
			}
			await api.cancelCvGeneration(cvGenerationId);
			return { ok: true, intent };
		}

		if (intent === "delete-cv") {
			const applicationCvId = Number(formData.get("applicationCvId"));
			if (!Number.isInteger(applicationCvId) || applicationCvId <= 0) {
				return { ok: false, intent, error: "Invalid generated CV." };
			}
			await api.deleteApplicationCv(applicationCvId);
			return { ok: true, intent };
		}

		if (intent === "download-cv") {
			const applicationCvId = Number(formData.get("applicationCvId"));
			if (!Number.isInteger(applicationCvId) || applicationCvId <= 0) {
				return { ok: false, intent, error: "Invalid generated CV." };
			}
			const download = await api.getApplicationCvDownload(applicationCvId);
			return { ok: true, intent, uri: download.uri };
		}

		throw new Response("Unsupported action", { status: 400 });
	} catch (error) {
		const fallbackIntent: GenerateActionIntent =
			intent === "cancel" || intent === "delete-cv" || intent === "download-cv" || intent === "create"
				? intent
				: "create";
		return actionError(fallbackIntent, error);
	}
}
