import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { api, ApiError, requireSession } from "@/lib/api";
import {
	MAX_ADDITIONAL_INFO_CHARS,
	MAX_JOB_DESCRIPTION_CHARS,
} from "@/routes/generate-data";
import type { GeneratedCv } from "@/types/generated-cv";
import type { BaseCv } from "@/types/base-cv";
import type {
	AiConsent,
	CvGeneration,
	GeneratedCvFormat,
} from "@/types/cv-generation";

export const APPLICATION_GENERATE_ROUTE_ID = "application-generate";

export type ApplicationGenerateLoaderData = {
	applicationId: number;
	baseCvs: BaseCv[];
	consent: AiConsent;
	jobDescription: string;
	generations: CvGeneration[];
	generatedCvs: GeneratedCv[];
};

export type ApplicationGenerateActionIntent = "create";

export type ApplicationGenerateActionData = {
	ok: boolean;
	intent: ApplicationGenerateActionIntent;
	error?: string;
	fieldErrors?: Partial<
		Record<
			"baseCvId" | "format" | "jobDescription" | "additionalInformation" | "consentAccepted",
			string
		>
	>;
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
	MISSING_IDEMPOTENCY_KEY: "The generation request could not be started. Please try again.",
	APPLICATION_NOT_FOUND: "This application is no longer available.",
};

const parsePositiveApplicationId = (value: string | undefined) => {
	const applicationId = Number(value);

	if (!Number.isInteger(applicationId) || applicationId <= 0) {
		throw new Response("Invalid application id", { status: 400 });
	}

	return applicationId;
};

const actionError = (
	intent: ApplicationGenerateActionIntent,
	error: unknown,
): ApplicationGenerateActionData => {
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
		};
	}
	return {
		ok: false,
		intent,
		error: error instanceof Error ? error.message : "The operation could not be completed.",
	};
};

export async function applicationGenerateLoader({
	params,
}: LoaderFunctionArgs): Promise<ApplicationGenerateLoaderData> {
	await requireSession();

	const applicationId = parsePositiveApplicationId(params.applicationId);

	const [baseCvs, consent, generations, generatedCvs, jobDescription] =
		await Promise.all([
			api.getBaseCvs(),
			api.getAiConsent(),
			api.getCvGenerations(applicationId),
			api.getGeneratedCvs(applicationId).catch((error) => {
				if (error instanceof ApiError && error.status === 404) {
					return [] as GeneratedCv[];
				}
				throw error;
			}),
			api.getJobDescription(applicationId).then(
				(response) => response.jobDescriptionText ?? "",
				(error) => {
					if (error instanceof ApiError && error.status === 404) {
						return "";
					}
					throw error;
				},
			),
		]);

	return {
		applicationId,
		baseCvs,
		consent,
		jobDescription,
		generations,
		generatedCvs,
	};
}

export async function applicationGenerateAction({
	request,
	params,
}: ActionFunctionArgs): Promise<ApplicationGenerateActionData> {
	await requireSession();

	const applicationId = parsePositiveApplicationId(params.applicationId);
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "") as ApplicationGenerateActionIntent | "";

	try {
		if (intent === "create") {
			const baseCvId = Number(formData.get("baseCvId"));
			const formatValue = String(formData.get("format") ?? "");
			const jobDescription = String(formData.get("jobDescription") ?? "");
			const additionalInformation = String(formData.get("additionalInformation") ?? "");
			const consentAccepted = formData.get("consentAccepted") === "true";

			const fieldErrors: ApplicationGenerateActionData["fieldErrors"] = {};
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

		throw new Response("Unsupported action", { status: 400 });
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		return actionError(intent === "create" ? intent : "create", error);
	}
}
