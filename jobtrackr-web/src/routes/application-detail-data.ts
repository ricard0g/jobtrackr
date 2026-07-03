import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	ShouldRevalidateFunctionArgs,
} from "react-router";

import { ApiError, api, requireSession } from "@/lib/api";
import {
	applicationStatusOptions,
	type Application,
	type ApplicationPatchRequest,
	type ApplicationStatus,
	type RemoteType,
} from "@/types/application";
import type {
	Interview,
	InterviewCreateRequest,
	InterviewType,
} from "@/types/interview";
import type { BoardPlacement } from "@/components/kanban/board-state";

export type ApplicationDetailLoaderData = {
	application: Application;
	interviews: Interview[];
};

export type ApplicationFormField =
	| "applicationTitle"
	| "applicationStatus"
	| "applicationSalaryMin"
	| "applicationSalaryMax"
	| "applicationCurrency"
	| "applicationAppliedAt";

export type ApplicationDetailActionData =
	| {
			ok: true;
			intent: "updateApplication" | "updateTags";
			application: Application;
			boardPlacement: BoardPlacement;
	  }
	| {
			ok: true;
			intent: "createInterview" | "deleteInterview";
	  }
	| {
			ok: true;
			intent: "deleteApplication";
			applicationId: number;
	  }
	| {
			ok: false;
			intent:
				| "updateApplication"
				| "updateTags"
				| "createInterview"
				| "deleteInterview"
				| "deleteApplication";
			formError?: string;
			fieldErrors?: Partial<Record<ApplicationFormField, string>>;
	  };

const applicationStatusValues = applicationStatusOptions.map(
	(status) => status.value,
);

const isApplicationStatus = (value: string): value is ApplicationStatus =>
	applicationStatusValues.includes(value as ApplicationStatus);

const remoteTypeValues = ["ON_SITE", "HYBRID", "REMOTE"] satisfies RemoteType[];

const isRemoteType = (value: string): value is RemoteType =>
	remoteTypeValues.includes(value as RemoteType);

const interviewTypeValues = [
	"PHONE",
	"TECHNICAL",
	"ARCHITECTURE",
	"HR",
	"FINAL",
	"OTHER",
] satisfies InterviewType[];

const isInterviewType = (value: string): value is InterviewType =>
	interviewTypeValues.includes(value as InterviewType);

const parsePositiveApplicationId = (value: string | undefined) => {
	const applicationId = Number(value);

	if (!Number.isInteger(applicationId) || applicationId <= 0) {
		throw new Response("Invalid application id", { status: 400 });
	}

	return applicationId;
};

const toNullableString = (value: FormDataEntryValue | null) => {
	const trimmedValue = String(value ?? "").trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
};

const toNullableNumber = (value: FormDataEntryValue | null) => {
	const trimmedValue = String(value ?? "").trim();
	return trimmedValue.length > 0 ? Number(trimmedValue) : null;
};

const toOffsetDateTime = (value: FormDataEntryValue | null) => {
	const trimmedValue = String(value ?? "").trim();
	return trimmedValue ? new Date(`${trimmedValue}T00:00:00`).toISOString() : null;
};

const toOffsetDateTimeFromLocal = (value: FormDataEntryValue | null) => {
	const trimmedValue = String(value ?? "").trim();
	return trimmedValue ? new Date(trimmedValue).toISOString() : "";
};

const byScheduledAt = (first: Interview, second: Interview) =>
	new Date(first.interviewScheduledAt).getTime() -
	new Date(second.interviewScheduledAt).getTime();

const apiErrorMessage = (error: unknown, fallback: string) =>
	error instanceof ApiError ? error.message : fallback;

const parsePositiveFormId = (value: FormDataEntryValue | null) => {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
};

export async function applicationDetailLoader({
	params,
}: LoaderFunctionArgs): Promise<ApplicationDetailLoaderData> {
	await requireSession();

	const applicationId = parsePositiveApplicationId(params.applicationId);
	const [application, interviews] = await Promise.all([
		api.getApplicationById(applicationId),
		api.getInterviews(applicationId),
	]);

	return {
		application,
		interviews: interviews.toSorted(byScheduledAt),
	};
}

export async function applicationDetailAction({
	request,
	params,
}: ActionFunctionArgs): Promise<ApplicationDetailActionData> {
	await requireSession();

	const applicationId = parsePositiveApplicationId(params.applicationId);
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "");

	if (intent === "updateApplication") {
		return updateApplication(applicationId, formData);
	}
	if (intent === "updateTags") {
		return updateTags(applicationId, formData);
	}
	if (intent === "createInterview") {
		return createInterview(applicationId, formData);
	}
	if (intent === "deleteInterview") {
		return deleteInterview(applicationId, formData);
	}
	if (intent === "deleteApplication") {
		return deleteApplication(applicationId);
	}

	throw new Response("Unsupported action", { status: 400 });
}

async function updateApplication(
	applicationId: number,
	formData: FormData,
): Promise<ApplicationDetailActionData> {
	const fieldErrors: Partial<Record<ApplicationFormField, string>> = {};
	const applicationTitle = String(formData.get("applicationTitle") ?? "").trim();
	const applicationStatusValue = String(
		formData.get("applicationStatus") ?? "",
	);
	const applicationSalaryMin = toNullableNumber(
		formData.get("applicationSalaryMin"),
	);
	const applicationSalaryMax = toNullableNumber(
		formData.get("applicationSalaryMax"),
	);
	const applicationCurrency = String(
		formData.get("applicationCurrency") ?? "",
	).trim();
	const applicationAppliedAt = String(
		formData.get("applicationAppliedAt") ?? "",
	).trim();
	const applicationKanbanOrder = Number(formData.get("applicationKanbanOrder"));
	const previousStatusValue = String(formData.get("previousStatus") ?? "");

	if (!applicationTitle) {
		fieldErrors.applicationTitle = "Enter the job title.";
	}
	if (!isApplicationStatus(applicationStatusValue)) {
		fieldErrors.applicationStatus = "Select a status.";
	}
	if (
		applicationSalaryMin !== null &&
		(!Number.isFinite(applicationSalaryMin) || applicationSalaryMin < 0)
	) {
		fieldErrors.applicationSalaryMin = "Must be a number greater than or equal to 0.";
	}
	if (
		applicationSalaryMax !== null &&
		(!Number.isFinite(applicationSalaryMax) || applicationSalaryMax < 0)
	) {
		fieldErrors.applicationSalaryMax = "Must be a number greater than or equal to 0.";
	}
	if (
		applicationSalaryMin !== null &&
		applicationSalaryMax !== null &&
		Number.isFinite(applicationSalaryMin) &&
		Number.isFinite(applicationSalaryMax) &&
		applicationSalaryMax < applicationSalaryMin
	) {
		fieldErrors.applicationSalaryMax = "Must be greater than the minimum salary.";
	}
	if (applicationCurrency && !/^[A-Z]{3}$/.test(applicationCurrency)) {
		fieldErrors.applicationCurrency = "Use a 3-letter ISO code.";
	}
	if (applicationAppliedAt && Number.isNaN(new Date(`${applicationAppliedAt}T00:00:00`).getTime())) {
		fieldErrors.applicationAppliedAt = "Enter a valid date.";
	}

	if (Object.keys(fieldErrors).length > 0) {
		return { ok: false, intent: "updateApplication", fieldErrors };
	}

	const applicationStatus = applicationStatusValue as ApplicationStatus;
	const previousStatus = isApplicationStatus(previousStatusValue)
		? previousStatusValue
		: applicationStatus;
	const remoteTypeValue = String(formData.get("applicationRemoteType") ?? "");
	const applicationRemoteType =
		remoteTypeValue === "NONE" || !remoteTypeValue
			? null
			: isRemoteType(remoteTypeValue)
				? remoteTypeValue
				: null;
	const safeApplicationKanbanOrder = Number.isFinite(applicationKanbanOrder)
		? Math.max(0, applicationKanbanOrder)
		: 0;
	const payload = {
		applicationTitle,
		applicationJobUrl: toNullableString(formData.get("applicationJobUrl")),
		applicationLocation: toNullableString(formData.get("applicationLocation")),
		applicationRemoteType,
		applicationSource: toNullableString(formData.get("applicationSource")),
		applicationSalaryMin,
		applicationSalaryMax,
		applicationCurrency: toNullableString(formData.get("applicationCurrency")),
		applicationKanbanOrder: safeApplicationKanbanOrder,
		applicationAppliedAt: toOffsetDateTime(formData.get("applicationAppliedAt")),
	} satisfies ApplicationPatchRequest;

	try {
		const updatedApplication =
			applicationStatus === previousStatus
				? await api.patchApplication(applicationId, payload)
				: await api
						.setApplicationStatus(applicationId, applicationStatus)
						.then(() => api.patchApplication(applicationId, payload));

		return {
			ok: true,
			intent: "updateApplication",
			application: updatedApplication,
			boardPlacement:
				applicationStatus === previousStatus
					? "preserve-position"
					: "append-to-status",
		};
	} catch (error) {
		return {
			ok: false,
			intent: "updateApplication",
			formError: apiErrorMessage(error, "Could not update the application."),
		};
	}
}

async function updateTags(
	applicationId: number,
	formData: FormData,
): Promise<ApplicationDetailActionData> {
	const selectedTagIds = new Set(
		formData
			.getAll("tagIds")
			.map((value) => Number(value))
			.filter((tagId) => Number.isInteger(tagId) && tagId > 0),
	);

	try {
		const application = await api.getApplicationById(applicationId);
		const currentTagIds = new Set(application.tags.map((tag) => tag.tagId));
		const addTagIds = Array.from(selectedTagIds).filter(
			(tagId) => !currentTagIds.has(tagId),
		);
		const removeTagIds = Array.from(currentTagIds).filter(
			(tagId) => !selectedTagIds.has(tagId),
		);
		const updatedApplication = await api.patchApplication(applicationId, {
			addTagIds,
			removeTagIds,
		});

		return {
			ok: true,
			intent: "updateTags",
			application: updatedApplication,
			boardPlacement: "preserve-position",
		};
	} catch (error) {
		return {
			ok: false,
			intent: "updateTags",
			formError: apiErrorMessage(error, "Could not update tags."),
		};
	}
}

async function createInterview(
	applicationId: number,
	formData: FormData,
): Promise<ApplicationDetailActionData> {
	const interviewTypeValue = String(formData.get("interviewType") ?? "");
	const interviewScheduledAt = String(
		formData.get("interviewScheduledAt") ?? "",
	).trim();

	if (!isInterviewType(interviewTypeValue)) {
		return {
			ok: false,
			intent: "createInterview",
			formError: "Select an interview type.",
		};
	}
	if (!interviewScheduledAt) {
		return {
			ok: false,
			intent: "createInterview",
			formError: "Enter the interview date.",
		};
	}

	const payload = {
		interviewType: interviewTypeValue,
		interviewScheduledAt: toOffsetDateTimeFromLocal(
			formData.get("interviewScheduledAt"),
		),
		interviewLocation: toNullableString(formData.get("interviewLocation")),
		interviewNotes: toNullableString(formData.get("interviewNotes")),
	} satisfies InterviewCreateRequest;

	try {
		await api.createInterview(applicationId, payload);
		return { ok: true, intent: "createInterview" };
	} catch (error) {
		return {
			ok: false,
			intent: "createInterview",
			formError: apiErrorMessage(error, "Could not create the interview."),
		};
	}
}

async function deleteInterview(
	applicationId: number,
	formData: FormData,
): Promise<ApplicationDetailActionData> {
	const interviewId = parsePositiveFormId(formData.get("interviewId"));
	if (!interviewId) {
		return {
			ok: false,
			intent: "deleteInterview",
			formError: "Invalid interview id.",
		};
	}

	try {
		await api.deleteInterview(applicationId, interviewId);
		return { ok: true, intent: "deleteInterview" };
	} catch (error) {
		return {
			ok: false,
			intent: "deleteInterview",
			formError: apiErrorMessage(error, "Could not delete the interview."),
		};
	}
}

async function deleteApplication(
	applicationId: number,
): Promise<ApplicationDetailActionData> {
	try {
		await api.deleteApplication(applicationId);
		return { ok: true, intent: "deleteApplication", applicationId };
	} catch (error) {
		return {
			ok: false,
			intent: "deleteApplication",
			formError: apiErrorMessage(error, "Could not delete the application."),
		};
	}
}

export function applicationDetailShouldRevalidate({
	actionResult,
	currentParams,
	defaultShouldRevalidate,
	nextParams,
}: ShouldRevalidateFunctionArgs) {
	if (currentParams.applicationId !== nextParams.applicationId) {
		return true;
	}

	if (
		actionResult &&
		typeof actionResult === "object" &&
		"intent" in actionResult
	) {
		const intent = (actionResult as ApplicationDetailActionData).intent;
		return intent === "createInterview" || intent === "deleteInterview";
	}

	return defaultShouldRevalidate;
}
