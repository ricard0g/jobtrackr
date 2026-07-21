import type { BaseCvFormat } from "@/types/base-cv";

export type CvGenerationStatus =
	| "PENDING"
	| "PROCESSING"
	| "COMPLETED"
	| "FAILED"
	| "CANCELLED";

export type GeneratedCvFormat = BaseCvFormat;

export type CvGeneration = {
	cvGenerationId: number;
	applicationId: number;
	baseCvId: number | null;
	requestedFormat: GeneratedCvFormat;
	status: CvGenerationStatus;
	idempotencyKey: string;
	correlationId: string;
	errorCode: string | null;
	errorMessage: string | null;
	applicationCvId: number | null;
	modelId: string | null;
	workflowVersion: string | null;
	createdAt: string;
	updatedAt: string;
	startedAt: string | null;
	completedAt: string | null;
	statusUrl: string;
};

export type CreateCvGenerationRequest = {
	applicationId: number;
	baseCvId: number;
	format: GeneratedCvFormat;
	jobDescription: string;
	additionalInformation?: string | null;
	consentAccepted: boolean;
};

export type AiConsent = {
	consentVersion: string | null;
	consentedAt: string | null;
	current: boolean;
};

export type AiConsentRequest = {
	accepted: boolean;
};

export type JobDescriptionResponse = {
	applicationId: number;
	jobDescriptionText: string;
};

export const cvGenerationStatusLabels: Record<CvGenerationStatus, string> = {
	PENDING: "Queued",
	PROCESSING: "Generating",
	COMPLETED: "Completed",
	FAILED: "Failed",
	CANCELLED: "Cancelled",
};

export const isActiveCvGenerationStatus = (status: CvGenerationStatus) =>
	status === "PENDING" || status === "PROCESSING";
