import { HttpResponse, http } from "msw";

import { API_BASE_URL, AUTH_BASE_URL } from "@/lib/api-config";
import {
	createOwnedTag,
	findAccessibleCompany,
	findAccessibleTag,
	findOwnedCompany,
	getAccessibleCompanies,
	getAccessibleTags,
	loadState,
	nextId,
	normalizeEmail,
	normalizeOptional,
	normalizeTagColor,
	nowIso,
	resolveAccessibleTagIds,
	resolveCompanyLogo,
	saveState,
	statefulTagOwnerId,
	toApplication,
} from "@/mocks/db";
import {
	csrfInvalid,
	errorJson,
	unauthorized,
	validationError,
} from "@/mocks/responses";
import type {
	AuthContext,
	MockApplicationRecord,
	MockCvGenerationRecord,
	MockState,
	PathParams,
} from "@/mocks/types";
import type {
	ApplicationCreateRequest,
	ApplicationPatchRequest,
	ApplicationPutRequest,
	ApplicationStatus,
	ApplicationStatusPatchRequest,
} from "@/types/application";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@/types/auth";
import type { CompanyWriteRequest } from "@/types/company";
import type { InterviewCreateRequest, InterviewOutcomePatchRequest, InterviewPutRequest } from "@/types/interview";
import type { TagWriteRequest } from "@/types/tag";
import type { User } from "@/types/user";
import type { BaseCv, BaseCvFormat } from "@/types/base-cv";
import type {
	CreateCvGenerationRequest,
	CvGeneration,
	GeneratedCvFormat,
} from "@/types/cv-generation";
import { MOCK_AI_CONSENT_VERSION } from "@/mocks/seed";

const applicationStatuses: ApplicationStatus[] = [
	"APPLIED",
	"IN_REVIEW",
	"INTERVIEW",
	"OFFER",
	"REJECTED",
	"WITHDRAWN",
];

const isApplicationStatus = (value: unknown): value is ApplicationStatus =>
	typeof value === "string" &&
	applicationStatuses.includes(value as ApplicationStatus);

const randomToken = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getParam = (params: PathParams, name: string) => {
	const value = params[name];
	return Array.isArray(value) ? value[0] : value;
};

const getPositiveId = (params: PathParams, name: string) => {
	const value = Number(getParam(params, name));
	return Number.isInteger(value) && value > 0 ? value : null;
};

const readJson = async <T>(request: Request): Promise<T> =>
	(await request.json()) as T;

const requireCsrf = (request: Request, state: MockState) =>
	request.headers.get("X-XSRF-TOKEN") === state.csrfToken;

const createAuthResponse = (state: MockState, user: User): AuthResponse => {
	const accessToken = randomToken("mock-access");
	const refreshToken = randomToken("mock-refresh");

	state.sessions = state.sessions.filter((session) => session.userId !== user.userId);
	state.sessions.push({ userId: user.userId, accessToken, refreshToken });
	state.activeRefreshToken = refreshToken;

	return {
		accessToken,
		tokenType: "Bearer",
		expiresIn: 900,
		user,
	};
};

const requireAuth = (request: Request, state: MockState): AuthContext | Response => {
	const authorization = request.headers.get("Authorization");
	const token = authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: null;
	const session = token
		? state.sessions.find((candidate) => candidate.accessToken === token)
		: undefined;
	const user = session
		? state.users.find((candidate) => candidate.userId === session.userId)
		: undefined;

	if (!session || !user) return unauthorized();

	return { user, session };
};

const companyNameExists = (
	state: MockState,
	userId: string,
	companyName: string,
	ignoredCompanyId?: number,
) =>
	state.companies.some(
		(company) =>
			company.companyId !== ignoredCompanyId &&
			(company.global || company.userId === userId) &&
			company.companyName.toLowerCase() === companyName.toLowerCase(),
	);

const tagNameExists = (
	state: MockState,
	userId: string,
	tagName: string,
	ignoredTagId?: number,
) =>
	state.tags.some(
		(tag) =>
			tag.tagId !== ignoredTagId &&
			(tag.global || statefulTagOwnerId(tag) === userId) &&
			tag.tagName.toLowerCase() === tagName.toLowerCase(),
	);

const validateSalaryRange = (
	salaryMin: number | null | undefined,
	salaryMax: number | null | undefined,
) => {
	if (salaryMin === null || salaryMin === undefined) return null;
	if (salaryMax === null || salaryMax === undefined) return null;
	return salaryMax < salaryMin
		? errorJson(
				400,
				"INVALID_APPLICATION_SALARY_RANGE",
				`Application salary max must be greater than or equal to salary min: min=${salaryMin}, max=${salaryMax}`,
			)
		: null;
};

const MAX_BASE_CV_BYTES = 10 * 1024 * 1024;
const MAX_APPLICATION_CVS = 20;
const MAX_JOB_DESCRIPTION_CHARS = 50_000;
const MAX_ADDITIONAL_INFO_CHARS = 5_000;
const generatedFormats: GeneratedCvFormat[] = ["PDF", "DOCX", "MARKDOWN"];

const isGeneratedFormat = (value: unknown): value is GeneratedCvFormat =>
	typeof value === "string" && generatedFormats.includes(value as GeneratedCvFormat);

const toPublicCvGeneration = (generation: MockCvGenerationRecord): CvGeneration => ({
	cvGenerationId: generation.cvGenerationId,
	applicationId: generation.applicationId,
	baseCvId: generation.baseCvId,
	requestedFormat: generation.requestedFormat,
	status: generation.status,
	idempotencyKey: generation.idempotencyKey,
	correlationId: generation.correlationId,
	errorCode: generation.errorCode,
	errorMessage: generation.errorMessage,
	applicationCvId: generation.applicationCvId,
	modelId: generation.modelId,
	workflowVersion: generation.workflowVersion,
	createdAt: generation.createdAt,
	updatedAt: generation.updatedAt,
	startedAt: generation.startedAt,
	completedAt: generation.completedAt,
	statusUrl: generation.statusUrl,
});

const getAiConsentForUser = (state: MockState, userId: string) => {
	const record = state.aiConsents.find((consent) => consent.userId === userId);
	if (!record) {
		return { consentVersion: null, consentedAt: null, current: false };
	}
	const current =
		record.consentVersion === MOCK_AI_CONSENT_VERSION && record.consentedAt !== null;
	return {
		consentVersion: record.consentVersion,
		consentedAt: record.consentedAt,
		current,
	};
};

const ensureAiConsent = (
	state: MockState,
	userId: string,
	consentAccepted: boolean,
) => {
	const current = getAiConsentForUser(state, userId);
	if (current.current) return null;
	if (!consentAccepted) {
		return errorJson(
			403,
			"AI_CONSENT_REQUIRED",
			"Explicit consent is required before sending CV data to Google Gemini",
		);
	}
	const existing = state.aiConsents.find((consent) => consent.userId === userId);
	const timestamp = nowIso();
	if (existing) {
		existing.consentVersion = MOCK_AI_CONSENT_VERSION;
		existing.consentedAt = timestamp;
		existing.current = true;
	} else {
		state.aiConsents.push({
			userId,
			consentVersion: MOCK_AI_CONSENT_VERSION,
			consentedAt: timestamp,
			current: true,
		});
	}
	return null;
};

const baseCvContentTypes: Record<BaseCvFormat, string[]> = {
	PDF: ["application/pdf"],
	DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
	MARKDOWN: ["text/markdown", "text/plain"],
};

const baseCvFormat = (filename: string): BaseCvFormat | null => {
	const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
	if (extension === "pdf") return "PDF";
	if (extension === "docx") return "DOCX";
	if (extension === "md") return "MARKDOWN";
	return null;
};

const toPublicBaseCv = (baseCv: MockState["baseCvs"][number]): BaseCv => ({
	baseCvId: baseCv.baseCvId,
	originalFilename: baseCv.originalFilename,
	format: baseCv.format,
	contentType: baseCv.contentType,
	byteSize: baseCv.byteSize,
	createdAt: baseCv.createdAt,
});

const sha256 = async (bytes: ArrayBuffer) => {
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
};

const validateMockBaseCv = (file: File, bytes: Uint8Array, format: BaseCvFormat) => {
	const contentType = file.type.split(";", 1)[0].toLowerCase();
	if (!baseCvContentTypes[format].includes(contentType)) {
		return errorJson(400, "INVALID_BASE_CV_FORMAT", "File extension and content type must match");
	}
	if (format === "PDF") {
		const prefix = new TextDecoder().decode(bytes.slice(0, 5));
		const body = new TextDecoder("latin1").decode(bytes);
		if (!prefix.startsWith("%PDF")) return errorJson(400, "MALFORMED_BASE_CV", "Malformed PDF");
		if (body.includes("/Encrypt")) return errorJson(400, "PROTECTED_BASE_CV", "Protected PDF");
	}
	if (format === "DOCX") {
		const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
		if (isOle) return errorJson(400, "PROTECTED_BASE_CV", "Protected DOCX");
		const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
		if (!isZip) return errorJson(400, "MALFORMED_BASE_CV", "Malformed DOCX");
	}
	if (format === "MARKDOWN") {
		if (bytes.includes(0)) return errorJson(400, "MALFORMED_BASE_CV", "Malformed Markdown");
		try {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
			const meaningful = Array.from(text).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
			if (meaningful < 10) return errorJson(400, "MALFORMED_BASE_CV", "Markdown has no meaningful text");
		} catch {
			return errorJson(400, "MALFORMED_BASE_CV", "Markdown is not valid UTF-8");
		}
	}
	return null;
};

const requireAccessibleCompany = (
	state: MockState,
	userId: string,
	companyId: number | null | undefined,
) => {
	if (!companyId) return null;
	return findAccessibleCompany(state, userId, companyId);
};

const requireOwnedCompany = (
	state: MockState,
	userId: string,
	companyId: number | null | undefined,
) => {
	if (!companyId) return null;
	return findOwnedCompany(state, userId, companyId);
};

const requireApplicationForUser = (
	state: MockState,
	userId: string,
	applicationId: number | null,
) => {
	if (!applicationId) return null;
	return state.applications.find(
		(application) =>
			application.applicationId === applicationId &&
			application.userId === userId,
	);
};

const requireInterviewForUser = (
	state: MockState,
	userId: string,
	applicationId: number | null,
	interviewId: number | null,
) => {
	const application = requireApplicationForUser(state, userId, applicationId);
	if (!application || !interviewId) return null;
	return state.interviews.find(
		(interview) =>
			interview.applicationId === application.applicationId &&
			interview.interviewId === interviewId,
	);
};

const toValidationField = (field: string, message: string) => ({
	field,
	message,
});

const validateCompanyRequest = (request: CompanyWriteRequest) => {
	const fieldErrors = [];
	if (!request.companyName?.trim()) {
		fieldErrors.push(toValidationField("companyName", "must not be blank"));
	}
	return fieldErrors.length > 0 ? validationError(fieldErrors) : null;
};

const validateTagRequest = (request: TagWriteRequest) => {
	const fieldErrors = [];
	if (!request.tagCategory) {
		fieldErrors.push(toValidationField("tagCategory", "must not be null"));
	}
	if (!request.tagName?.trim()) {
		fieldErrors.push(toValidationField("tagName", "must not be blank"));
	}
	if (
		request.tagColor &&
		request.tagColor.trim() &&
		!/^#[0-9A-Fa-f]{6}$/.test(request.tagColor)
	) {
		fieldErrors.push(toValidationField("tagColor", "must match #RRGGBB"));
	}
	return fieldErrors.length > 0 ? validationError(fieldErrors) : null;
};

const ensureTagLimit = (tagIds: number[]) =>
	tagIds.length > 50
		? errorJson(
				400,
				"TOO_MANY_APPLICATION_TAGS",
				"Application cannot have more than 50 tags",
			)
		: null;

const patchNullable = <T>(
	value: T | null | undefined,
	apply: (value: T) => void,
) => {
	if (value !== undefined && value !== null) apply(value);
};

export const handlers = [
	http.get(`${AUTH_BASE_URL}/csrf`, () => {
		const state = loadState();
		return HttpResponse.json({
			headerName: "X-XSRF-TOKEN",
			parameterName: "_csrf",
			token: state.csrfToken,
		});
	}),

	http.post(`${AUTH_BASE_URL}/register`, async ({ request }) => {
		const state = loadState();
		const body = await readJson<RegisterRequest>(request);
		const email = normalizeEmail(body.email ?? "");

		if (!email || !body.password || body.password.length < 8) {
			return validationError([
				...(!email ? [toValidationField("email", "must be a well-formed email address")] : []),
				...(!body.password || body.password.length < 8
					? [toValidationField("password", "size must be between 8 and 72")]
					: []),
			]);
		}

		if (state.users.some((user) => user.userEmail === email)) {
			return errorJson(409, "DUPLICATE_EMAIL", "Email already exists");
		}

		const timestamp = nowIso();
		const user: User = {
			userId: crypto.randomUUID(),
			userEmail: email,
			userDisplayName: normalizeOptional(body.displayName) ?? null,
			userPictureUrl: null,
			userEnabled: true,
			userLocked: false,
			userDeletedAt: null,
			userPasswordChangedAt: null,
			userLastLoginAt: timestamp,
			userCreatedAt: timestamp,
			userUpdatedAt: timestamp,
		};

		state.users.push(user);
		state.credentials.push({ userId: user.userId, email, password: body.password });
		const response = createAuthResponse(state, user);
		saveState(state);
		return HttpResponse.json(response, { status: 201 });
	}),

	http.post(`${AUTH_BASE_URL}/login`, async ({ request }) => {
		const state = loadState();
		const body = await readJson<LoginRequest>(request);
		const email = normalizeEmail(body.email ?? "");
		const credentials = state.credentials.find(
			(candidate) =>
				candidate.email === email && candidate.password === body.password,
		);

		if (!credentials) {
			return errorJson(401, "INVALID_CREDENTIALS", "Invalid email or password");
		}

		const user = state.users.find(
			(candidate) => candidate.userId === credentials.userId,
		);
		if (!user) return errorJson(404, "USER_NOT_FOUND", "User not found");

		user.userLastLoginAt = nowIso();
		user.userUpdatedAt = user.userLastLoginAt;
		const response = createAuthResponse(state, user);
		saveState(state);
		return HttpResponse.json(response);
	}),

	http.post(`${AUTH_BASE_URL}/refresh`, ({ request }) => {
		const state = loadState();
		if (!requireCsrf(request, state)) return csrfInvalid();
		const session = state.sessions.find(
			(candidate) => candidate.refreshToken === state.activeRefreshToken,
		);
		const user = session
			? state.users.find((candidate) => candidate.userId === session.userId)
			: undefined;

		if (!session || !user) {
			return errorJson(401, "INVALID_REFRESH_TOKEN", "Refresh token is missing");
		}

		const response = createAuthResponse(state, user);
		saveState(state);
		return HttpResponse.json(response);
	}),

	http.post(`${AUTH_BASE_URL}/logout`, ({ request }) => {
		const state = loadState();
		if (!requireCsrf(request, state)) return csrfInvalid();
		state.sessions = state.sessions.filter(
			(session) => session.refreshToken !== state.activeRefreshToken,
		);
		state.activeRefreshToken = null;
		saveState(state);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(`${API_BASE_URL}/user`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		return HttpResponse.json(auth.user);
	}),

	http.get(`${API_BASE_URL}/base-cvs`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		return HttpResponse.json(
			state.baseCvs
				.filter((baseCv) => baseCv.userId === auth.user.userId)
				.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
				.map(toPublicBaseCv),
		);
	}),

	http.post(`${API_BASE_URL}/base-cvs`, async ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const owned = state.baseCvs.filter((baseCv) => baseCv.userId === auth.user.userId);
		if (owned.length >= 20) return errorJson(409, "BASE_CV_LIMIT_REACHED", "Base CV limit reached");
		const formData = await request.formData();
		const file = formData.get("file");
		if (!(file instanceof File) || file.size === 0) {
			return errorJson(400, "MALFORMED_BASE_CV", "Choose one non-empty file");
		}
		if (file.size > MAX_BASE_CV_BYTES) return errorJson(413, "BASE_CV_TOO_LARGE", "Base CV exceeds 10 MB");
		const format = baseCvFormat(file.name);
		if (!format) return errorJson(400, "INVALID_BASE_CV_FORMAT", "Unsupported Base CV format");
		const buffer = await file.arrayBuffer();
		const bytes = new Uint8Array(buffer);
		const validationResponse = validateMockBaseCv(file, bytes, format);
		if (validationResponse) return validationResponse;
		const checksum = await sha256(buffer);
		if (owned.some((baseCv) => baseCv.sha256 === checksum)) {
			return errorJson(409, "DUPLICATE_BASE_CV", "This Base CV already exists");
		}
		const originalFilename = file.name.replaceAll(/[\p{Cc}]/gu, "").replaceAll("\\", "/").split("/").at(-1)?.slice(0, 255) || "base-cv";
		const baseCv = {
			baseCvId: nextId(state, "baseCvId"),
			userId: auth.user.userId,
			sha256: checksum,
			originalFilename,
			format,
			contentType: file.type,
			byteSize: file.size,
			createdAt: nowIso(),
		};
		state.baseCvs.push(baseCv);
		saveState(state);
		return HttpResponse.json(toPublicBaseCv(baseCv), { status: 201 });
	}),

	http.get(`${API_BASE_URL}/base-cvs/:baseCvId/download`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const baseCvId = getPositiveId(params, "baseCvId");
		const baseCv = state.baseCvs.find(
			(candidate) => candidate.baseCvId === baseCvId && candidate.userId === auth.user.userId,
		);
		if (!baseCv) return errorJson(404, "BASE_CV_NOT_FOUND", "Base CV not found");
		const body = `Mock download for ${baseCv.originalFilename}`;
		const uri = `data:${baseCv.contentType};charset=utf-8,${encodeURIComponent(body)}`;
		return HttpResponse.json({ uri });
	}),

	http.delete(`${API_BASE_URL}/base-cvs/:baseCvId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const baseCvId = getPositiveId(params, "baseCvId");
		const index = state.baseCvs.findIndex((candidate) => candidate.baseCvId === baseCvId && candidate.userId === auth.user.userId);
		if (index < 0) return errorJson(404, "BASE_CV_NOT_FOUND", "Base CV not found");
		const inUse = state.cvGenerations.some(
			(generation) =>
				generation.baseCvId === baseCvId &&
				generation.userId === auth.user.userId &&
				(generation.status === "PENDING" || generation.status === "PROCESSING"),
		);
		if (inUse) {
			return errorJson(
				409,
				"BASE_CV_IN_USE",
				"This Base CV is in use by an active generation and cannot be deleted",
			);
		}
		state.baseCvs.splice(index, 1);
		saveState(state);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(`${API_BASE_URL}/companies`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;

		const url = new URL(request.url);
		const search = url.searchParams.get("search")?.trim() ?? "";
		const hasSearchParam = url.searchParams.has("search");
		const hasPageParam = url.searchParams.has("page");
		const hasSizeParam = url.searchParams.has("size");

		if (!hasSearchParam && !hasPageParam && !hasSizeParam) {
			return HttpResponse.json(getAccessibleCompanies(state, auth.user.userId));
		}

		const page = Math.max(0, Number(url.searchParams.get("page") ?? "0") || 0);
		const size = Math.max(1, Number(url.searchParams.get("size") ?? "20") || 20);
		const normalizedSearch = search.toLowerCase();

		const filteredCompanies = getAccessibleCompanies(state, auth.user.userId).filter(
			(company) =>
				normalizedSearch.length === 0 ||
				company.companyName.toLowerCase().includes(normalizedSearch),
		);
		const start = page * size;
		const items = filteredCompanies.slice(start, start + size);

		return HttpResponse.json({
			items,
			total: filteredCompanies.length,
			page,
			size,
		});
	}),

	http.get(`${API_BASE_URL}/companies/:companyId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const companyId = getPositiveId(params, "companyId");
		const company = requireAccessibleCompany(state, auth.user.userId, companyId);
		if (!company) {
			return errorJson(
				404,
				"COMPANY_NOT_FOUND",
				`Company not found with id: ${companyId} for user id: ${auth.user.userId}`,
			);
		}
		return HttpResponse.json(company);
	}),

	http.post(`${API_BASE_URL}/companies`, async ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const body = await readJson<CompanyWriteRequest>(request);
		const validationResponse = validateCompanyRequest(body);
		if (validationResponse) return validationResponse;
		const companyName = body.companyName.trim();

		if (companyNameExists(state, auth.user.userId, companyName)) {
			return errorJson(
				409,
				"DUPLICATE_COMPANY_NAME",
				`Company name already exists for user id: ${auth.user.userId}: ${companyName}`,
			);
		}

		const companyWebsiteUrl = normalizeOptional(body.companyWebsiteUrl);
		const timestamp = nowIso();
		const company = {
			companyId: nextId(state, "companyId"),
			userId: auth.user.userId,
			global: false,
			companyName,
			companyWebsiteUrl,
			companyLocation: normalizeOptional(body.companyLocation),
			companyType: normalizeOptional(body.companyType),
			companyLogo: resolveCompanyLogo(body.companyLogo, companyWebsiteUrl),
			companyCreatedAt: timestamp,
			companyUpdatedAt: timestamp,
		};
		state.companies.push(company);
		saveState(state);
		return HttpResponse.json(company, { status: 201 });
	}),

	http.put(`${API_BASE_URL}/companies/:companyId`, async ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const companyId = getPositiveId(params, "companyId");
		const company = requireOwnedCompany(state, auth.user.userId, companyId);
		if (!company) return errorJson(404, "COMPANY_NOT_FOUND", "Company not found");
		const body = await readJson<CompanyWriteRequest>(request);
		const validationResponse = validateCompanyRequest(body);
		if (validationResponse) return validationResponse;
		const companyName = body.companyName.trim();

		if (companyNameExists(state, auth.user.userId, companyName, company.companyId)) {
			return errorJson(
				409,
				"DUPLICATE_COMPANY_NAME",
				`Company name already exists for user id: ${auth.user.userId}: ${companyName}`,
			);
		}

		const companyWebsiteUrl = normalizeOptional(body.companyWebsiteUrl);
		company.companyName = companyName;
		company.companyWebsiteUrl = companyWebsiteUrl;
		company.companyLocation = normalizeOptional(body.companyLocation);
		company.companyType = normalizeOptional(body.companyType);
		company.companyLogo = resolveCompanyLogo(body.companyLogo, companyWebsiteUrl);
		company.companyUpdatedAt = nowIso();
		saveState(state);
		return HttpResponse.json(company);
	}),

	http.delete(`${API_BASE_URL}/companies/:companyId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const companyId = getPositiveId(params, "companyId");
		const company = requireOwnedCompany(state, auth.user.userId, companyId);
		if (!company) return errorJson(404, "COMPANY_NOT_FOUND", "Company not found");
		if (
			state.applications.some(
				(application) => application.companyId === company.companyId,
			)
		) {
			return errorJson(
				409,
				"COMPANY_HAS_APPLICATIONS",
				`Cannot delete company with id: ${company.companyId} because it has linked applications`,
			);
		}

		state.companies = state.companies.filter(
			(candidate) => candidate.companyId !== company.companyId,
		);
		saveState(state);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(`${API_BASE_URL}/tags`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		return HttpResponse.json(getAccessibleTags(state, auth.user.userId));
	}),

	http.get(`${API_BASE_URL}/tags/:tagId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const tagId = getPositiveId(params, "tagId");
		const tag = tagId ? findAccessibleTag(state, auth.user.userId, tagId) : null;
		if (!tag) return errorJson(404, "TAG_NOT_FOUND", `Tag not found with id: ${tagId}`);
		return HttpResponse.json(tag);
	}),

	http.post(`${API_BASE_URL}/tags`, async ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const body = await readJson<TagWriteRequest>(request);
		const validationResponse = validateTagRequest(body);
		if (validationResponse) return validationResponse;
		const tagName = body.tagName.trim();
		if (tagNameExists(state, auth.user.userId, tagName)) {
			return errorJson(409, "DUPLICATE_TAG_NAME", `Tag name already exists: ${tagName}`);
		}

		const tag = createOwnedTag(
			{
				tagId: nextId(state, "tagId"),
				tagCategory: body.tagCategory,
				tagName,
				tagColor: normalizeTagColor(body.tagColor),
				global: false,
			},
			auth.user.userId,
		);
		state.tags.push(tag);
		saveState(state);
		return HttpResponse.json(tag, { status: 201 });
	}),

	http.put(`${API_BASE_URL}/tags/:tagId`, async ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const tagId = getPositiveId(params, "tagId");
		const tag = tagId
			? state.tags.find(
					(candidate) =>
						candidate.tagId === tagId &&
						statefulTagOwnerId(candidate) === auth.user.userId,
				)
			: null;
		if (!tag) return errorJson(404, "TAG_NOT_FOUND", `Tag not found with id: ${tagId}`);
		const body = await readJson<TagWriteRequest>(request);
		const validationResponse = validateTagRequest(body);
		if (validationResponse) return validationResponse;
		const tagName = body.tagName.trim();
		if (tagNameExists(state, auth.user.userId, tagName, tag.tagId)) {
			return errorJson(409, "DUPLICATE_TAG_NAME", `Tag name already exists: ${tagName}`);
		}

		tag.tagCategory = body.tagCategory;
		tag.tagName = tagName;
		tag.tagColor = normalizeTagColor(body.tagColor);
		saveState(state);
		return HttpResponse.json(tag);
	}),

	http.delete(`${API_BASE_URL}/tags/:tagId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const tagId = getPositiveId(params, "tagId");
		const tag = tagId
			? state.tags.find(
					(candidate) =>
						candidate.tagId === tagId &&
						statefulTagOwnerId(candidate) === auth.user.userId,
				)
			: null;
		if (!tag) return errorJson(404, "TAG_NOT_FOUND", `Tag not found with id: ${tagId}`);
		state.tags = state.tags.filter((candidate) => candidate.tagId !== tag.tagId);
		state.applications.forEach((application) => {
			application.tagIds = application.tagIds.filter(
				(candidateId) => candidateId !== tag.tagId,
			);
		});
		saveState(state);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(`${API_BASE_URL}/applications`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		return HttpResponse.json(
			state.applications
				.filter((application) => application.userId === auth.user.userId)
				.map((application) => toApplication(state, application)),
		);
	}),

	http.get(`${API_BASE_URL}/applications/:applicationId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationId = getPositiveId(params, "applicationId");
		const application = requireApplicationForUser(
			state,
			auth.user.userId,
			applicationId,
		);
		if (!application) {
			return errorJson(
				404,
				"APPLICATION_NOT_FOUND",
				`Application not found with id: ${applicationId} for user id: ${auth.user.userId}`,
			);
		}
		return HttpResponse.json(toApplication(state, application));
	}),

	http.post(`${API_BASE_URL}/applications`, async ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const body = await readJson<ApplicationCreateRequest>(request);
		const company = requireAccessibleCompany(state, auth.user.userId, body.companyId);
		if (!company) return errorJson(404, "COMPANY_NOT_FOUND", "Company not found");
		if (!body.applicationTitle?.trim() || !isApplicationStatus(body.applicationStatus)) {
			return validationError([
				...(!body.applicationTitle?.trim()
					? [toValidationField("applicationTitle", "must not be blank")]
					: []),
				...(!isApplicationStatus(body.applicationStatus)
					? [toValidationField("applicationStatus", "must not be null")]
					: []),
			]);
		}
		const salaryResponse = validateSalaryRange(
			body.applicationSalaryMin,
			body.applicationSalaryMax,
		);
		if (salaryResponse) return salaryResponse;
		const tagIds = resolveAccessibleTagIds(state, auth.user.userId, body.tagIds);
		if (!tagIds) return errorJson(404, "TAG_NOT_FOUND", "Tag not found");
		const tagLimitResponse = ensureTagLimit(tagIds);
		if (tagLimitResponse) return tagLimitResponse;

		const timestamp = nowIso();
		const application: MockApplicationRecord = {
			applicationId: nextId(state, "applicationId"),
			userId: auth.user.userId,
			companyId: company.companyId,
			tagIds,
			applicationTitle: body.applicationTitle.trim(),
			applicationJobUrl: normalizeOptional(body.applicationJobUrl),
			applicationLocation: normalizeOptional(body.applicationLocation),
			applicationRemoteType: body.applicationRemoteType ?? null,
			applicationSource: normalizeOptional(body.applicationSource),
			applicationSalaryMin: body.applicationSalaryMin ?? null,
			applicationSalaryMax: body.applicationSalaryMax ?? null,
			applicationCurrency: normalizeOptional(body.applicationCurrency),
			applicationStatus: body.applicationStatus,
			applicationKanbanOrder: body.applicationKanbanOrder ?? 0,
			applicationAppliedAt: body.applicationAppliedAt ?? null,
			applicationCreatedAt: timestamp,
			applicationUpdatedAt: timestamp,
		};
		state.applications.push(application);
		saveState(state);
		return HttpResponse.json(toApplication(state, application), { status: 201 });
	}),

	http.put(`${API_BASE_URL}/applications/:applicationId`, async ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationId = getPositiveId(params, "applicationId");
		const application = requireApplicationForUser(
			state,
			auth.user.userId,
			applicationId,
		);
		if (!application) return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
		const body = await readJson<ApplicationPutRequest>(request);
		const company = requireAccessibleCompany(state, auth.user.userId, body.companyId);
		if (!company) return errorJson(404, "COMPANY_NOT_FOUND", "Company not found");
		if (!body.applicationTitle?.trim()) {
			return validationError([
				toValidationField("applicationTitle", "must not be blank"),
			]);
		}
		const salaryResponse = validateSalaryRange(
			body.applicationSalaryMin,
			body.applicationSalaryMax,
		);
		if (salaryResponse) return salaryResponse;

		application.companyId = company.companyId;
		application.applicationTitle = body.applicationTitle.trim();
		application.applicationJobUrl = normalizeOptional(body.applicationJobUrl);
		application.applicationLocation = normalizeOptional(body.applicationLocation);
		application.applicationRemoteType = body.applicationRemoteType ?? null;
		application.applicationSource = normalizeOptional(body.applicationSource);
		application.applicationSalaryMin = body.applicationSalaryMin ?? null;
		application.applicationSalaryMax = body.applicationSalaryMax ?? null;
		application.applicationCurrency = normalizeOptional(body.applicationCurrency);
		application.applicationKanbanOrder = body.applicationKanbanOrder ?? 0;
		application.applicationAppliedAt = body.applicationAppliedAt ?? null;
		application.applicationUpdatedAt = nowIso();
		saveState(state);
		return HttpResponse.json(toApplication(state, application));
	}),

	http.patch(`${API_BASE_URL}/applications/:applicationId`, async ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationId = getPositiveId(params, "applicationId");
		const application = requireApplicationForUser(
			state,
			auth.user.userId,
			applicationId,
		);
		if (!application) return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
		const body = await readJson<ApplicationPatchRequest>(request);
		if (body.companyId !== undefined && body.companyId !== null) {
			const company = requireAccessibleCompany(state, auth.user.userId, body.companyId);
			if (!company) return errorJson(404, "COMPANY_NOT_FOUND", "Company not found");
			application.companyId = company.companyId;
		}

		patchNullable(body.applicationTitle, (value) => {
			application.applicationTitle = value.trim();
		});
		patchNullable(body.applicationKanbanOrder, (value) => {
			application.applicationKanbanOrder = value;
		});
		patchNullable(body.applicationJobUrl, (value) => {
			application.applicationJobUrl = normalizeOptional(value);
		});
		patchNullable(body.applicationLocation, (value) => {
			application.applicationLocation = normalizeOptional(value);
		});
		patchNullable(body.applicationRemoteType, (value) => {
			application.applicationRemoteType = value;
		});
		patchNullable(body.applicationSource, (value) => {
			application.applicationSource = normalizeOptional(value);
		});
		patchNullable(body.applicationSalaryMin, (value) => {
			application.applicationSalaryMin = value;
		});
		patchNullable(body.applicationSalaryMax, (value) => {
			application.applicationSalaryMax = value;
		});
		patchNullable(body.applicationCurrency, (value) => {
			application.applicationCurrency = normalizeOptional(value);
		});
		patchNullable(body.applicationAppliedAt, (value) => {
			application.applicationAppliedAt = value;
		});

		const salaryResponse = validateSalaryRange(
			application.applicationSalaryMin,
			application.applicationSalaryMax,
		);
		if (salaryResponse) return salaryResponse;

		const tagIds = new Set(application.tagIds);
		body.removeTagIds?.forEach((tagId) => tagIds.delete(tagId));
		if (body.addTagIds?.length) {
			const resolvedTagIds = resolveAccessibleTagIds(
				state,
				auth.user.userId,
				body.addTagIds,
			);
			if (!resolvedTagIds) return errorJson(404, "TAG_NOT_FOUND", "Tag not found");
			resolvedTagIds.forEach((tagId) => tagIds.add(tagId));
		}
		const nextTagIds = Array.from(tagIds);
		const tagLimitResponse = ensureTagLimit(nextTagIds);
		if (tagLimitResponse) return tagLimitResponse;
		application.tagIds = nextTagIds;
		application.applicationUpdatedAt = nowIso();
		saveState(state);
		return HttpResponse.json(toApplication(state, application));
	}),

	http.patch(
		`${API_BASE_URL}/applications/:applicationId/status`,
		async ({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const application = requireApplicationForUser(
				state,
				auth.user.userId,
				applicationId,
			);
			if (!application) {
				return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
			}
			const body = await readJson<ApplicationStatusPatchRequest>(request);
			if (!isApplicationStatus(body.applicationStatus)) {
				return validationError([
					toValidationField("applicationStatus", "must not be null"),
				]);
			}

			if (application.applicationStatus !== body.applicationStatus) {
				const timestamp = nowIso();
				state.statusHistories.push({
					statusHistoryId: nextId(state, "statusHistoryId"),
					applicationId: application.applicationId,
					statusHistoryOldStatus: application.applicationStatus,
					statusHistoryNewStatus: body.applicationStatus,
					statusHistoryChangedAt: timestamp,
					statusHistoryCreatedAt: timestamp,
				});
				application.applicationStatus = body.applicationStatus;
				application.applicationUpdatedAt = timestamp;
			}
			saveState(state);
			return HttpResponse.json(toApplication(state, application));
		},
	),

	http.get(
		`${API_BASE_URL}/applications/:applicationId/status-history`,
		({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const application = requireApplicationForUser(
				state,
				auth.user.userId,
				applicationId,
			);
			if (!application) {
				return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
			}
			return HttpResponse.json(
				state.statusHistories.filter(
					(history) => history.applicationId === application.applicationId,
				),
			);
		},
	),

	http.post(
		`${API_BASE_URL}/applications/:applicationId/tags`,
		async ({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const application = requireApplicationForUser(
				state,
				auth.user.userId,
				applicationId,
			);
			if (!application) {
				return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
			}
			const body = await readJson<TagWriteRequest>(request);
			const validationResponse = validateTagRequest(body);
			if (validationResponse) return validationResponse;
			const tagName = body.tagName.trim();
			if (tagNameExists(state, auth.user.userId, tagName)) {
				return errorJson(409, "DUPLICATE_TAG_NAME", `Tag name already exists: ${tagName}`);
			}
			const tagLimitResponse = ensureTagLimit([...application.tagIds, -1]);
			if (tagLimitResponse) return tagLimitResponse;

			const tag = createOwnedTag(
				{
					tagId: nextId(state, "tagId"),
					tagCategory: body.tagCategory,
					tagName,
					tagColor: normalizeTagColor(body.tagColor),
					global: false,
				},
				auth.user.userId,
			);
			state.tags.push(tag);
			application.tagIds.push(tag.tagId);
			application.applicationUpdatedAt = nowIso();
			saveState(state);
			return HttpResponse.json(tag, { status: 201 });
		},
	),

	http.delete(`${API_BASE_URL}/applications/:applicationId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationId = getPositiveId(params, "applicationId");
		const application = requireApplicationForUser(
			state,
			auth.user.userId,
			applicationId,
		);
		if (!application) return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
		const timestamp = nowIso();
		state.cvGenerations.forEach((generation) => {
			if (
				generation.applicationId === application.applicationId &&
				(generation.status === "PENDING" || generation.status === "PROCESSING")
			) {
				generation.status = "CANCELLED";
				generation.completedAt = timestamp;
				generation.updatedAt = timestamp;
				generation.errorCode = "CANCELLED";
				generation.errorMessage = "Generation cancelled because the application was deleted";
			}
		});
		state.applications = state.applications.filter(
			(candidate) => candidate.applicationId !== application.applicationId,
		);
		state.interviews = state.interviews.filter(
			(interview) => interview.applicationId !== application.applicationId,
		);
		state.statusHistories = state.statusHistories.filter(
			(history) => history.applicationId !== application.applicationId,
		);
		state.jobDescriptions = state.jobDescriptions.filter(
			(jobDescription) => jobDescription.applicationId !== application.applicationId,
		);
		state.applicationCvs = state.applicationCvs.filter(
			(applicationCv) => applicationCv.applicationId !== application.applicationId,
		);
		saveState(state);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(
		`${API_BASE_URL}/applications/:applicationId/interviews`,
		({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const application = requireApplicationForUser(
				state,
				auth.user.userId,
				applicationId,
			);
			if (!application) {
				return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
			}
			return HttpResponse.json(
				state.interviews.filter(
					(interview) => interview.applicationId === application.applicationId,
				),
			);
		},
	),

	http.get(
		`${API_BASE_URL}/applications/:applicationId/interviews/:interviewId`,
		({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const interviewId = getPositiveId(params, "interviewId");
			const interview = requireInterviewForUser(
				state,
				auth.user.userId,
				applicationId,
				interviewId,
			);
			if (!interview) {
				return errorJson(404, "INTERVIEW_NOT_FOUND", "Interview not found");
			}
			return HttpResponse.json(interview);
		},
	),

	http.post(
		`${API_BASE_URL}/applications/:applicationId/interviews`,
		async ({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const application = requireApplicationForUser(
				state,
				auth.user.userId,
				applicationId,
			);
			if (!application) {
				return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
			}
			const body = await readJson<InterviewCreateRequest>(request);
			if (!body.interviewType || !body.interviewScheduledAt) {
				return validationError([
					...(!body.interviewType
						? [toValidationField("interviewType", "must not be null")]
						: []),
					...(!body.interviewScheduledAt
						? [toValidationField("interviewScheduledAt", "must not be null")]
						: []),
				]);
			}

			const timestamp = nowIso();
			const interview = {
				interviewId: nextId(state, "interviewId"),
				applicationId: application.applicationId,
				interviewType: body.interviewType,
				interviewScheduledAt: body.interviewScheduledAt,
				interviewLocation: normalizeOptional(body.interviewLocation),
				interviewNotes: normalizeOptional(body.interviewNotes),
				interviewOutcome: "PENDING" as const,
				interviewCreatedAt: timestamp,
				interviewUpdatedAt: timestamp,
			};
			state.interviews.push(interview);
			saveState(state);
			return HttpResponse.json(interview, { status: 201 });
		},
	),

	http.put(
		`${API_BASE_URL}/applications/:applicationId/interviews/:interviewId`,
		async ({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const interviewId = getPositiveId(params, "interviewId");
			const interview = requireInterviewForUser(
				state,
				auth.user.userId,
				applicationId,
				interviewId,
			);
			if (!interview) {
				return errorJson(404, "INTERVIEW_NOT_FOUND", "Interview not found");
			}
			const body = await readJson<InterviewPutRequest>(request);
			if (!body.interviewType || !body.interviewScheduledAt || !body.interviewOutcome) {
				return validationError([
					...(!body.interviewType
						? [toValidationField("interviewType", "must not be null")]
						: []),
					...(!body.interviewScheduledAt
						? [toValidationField("interviewScheduledAt", "must not be null")]
						: []),
					...(!body.interviewOutcome
						? [toValidationField("interviewOutcome", "must not be null")]
						: []),
				]);
			}

			interview.interviewType = body.interviewType;
			interview.interviewScheduledAt = body.interviewScheduledAt;
			interview.interviewLocation = normalizeOptional(body.interviewLocation);
			interview.interviewNotes = normalizeOptional(body.interviewNotes);
			interview.interviewOutcome = body.interviewOutcome;
			interview.interviewUpdatedAt = nowIso();
			saveState(state);
			return HttpResponse.json(interview);
		},
	),

	http.patch(
		`${API_BASE_URL}/applications/:applicationId/interviews/:interviewId/outcome`,
		async ({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const interviewId = getPositiveId(params, "interviewId");
			const interview = requireInterviewForUser(
				state,
				auth.user.userId,
				applicationId,
				interviewId,
			);
			if (!interview) {
				return errorJson(404, "INTERVIEW_NOT_FOUND", "Interview not found");
			}
			const body = await readJson<InterviewOutcomePatchRequest>(request);
			const validOutcomes = ["PENDING", "PASSED", "FAILED", "CANCELLED"] as const;
			if (!body.interviewOutcome || !validOutcomes.includes(body.interviewOutcome)) {
				return validationError([
					toValidationField("interviewOutcome", "must not be null"),
				]);
			}

			interview.interviewOutcome = body.interviewOutcome;
			interview.interviewUpdatedAt = nowIso();
			saveState(state);
			return HttpResponse.json(interview);
		},
	),

	http.delete(
		`${API_BASE_URL}/applications/:applicationId/interviews/:interviewId`,
		({ request, params }) => {
			const state = loadState();
			const auth = requireAuth(request, state);
			if (auth instanceof Response) return auth;
			const applicationId = getPositiveId(params, "applicationId");
			const interviewId = getPositiveId(params, "interviewId");
			const interview = requireInterviewForUser(
				state,
				auth.user.userId,
				applicationId,
				interviewId,
			);
			if (!interview) {
				return errorJson(404, "INTERVIEW_NOT_FOUND", "Interview not found");
			}
			state.interviews = state.interviews.filter(
				(candidate) => candidate.interviewId !== interview.interviewId,
			);
			saveState(state);
			return new HttpResponse(null, { status: 204 });
		},
	),

	http.get(`${API_BASE_URL}/cv-generations`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const url = new URL(request.url);
		const applicationIdParam = url.searchParams.get("applicationId");
		const applicationId = applicationIdParam ? Number(applicationIdParam) : null;
		if (applicationIdParam !== null) {
			if (!Number.isInteger(applicationId) || !applicationId || applicationId <= 0) {
				return validationError([toValidationField("applicationId", "must be positive")]);
			}
			const application = requireApplicationForUser(state, auth.user.userId, applicationId);
			if (!application) {
				return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
			}
		}
		const generations = state.cvGenerations
			.filter((generation) => {
				if (generation.userId !== auth.user.userId) return false;
				if (applicationId) return generation.applicationId === applicationId;
				return true;
			})
			.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
			.map(toPublicCvGeneration);
		return HttpResponse.json(generations);
	}),

	http.get(`${API_BASE_URL}/cv-generations/:cvGenerationId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const cvGenerationId = getPositiveId(params, "cvGenerationId");
		const generation = state.cvGenerations.find(
			(candidate) =>
				candidate.cvGenerationId === cvGenerationId && candidate.userId === auth.user.userId,
		);
		if (!generation) {
			return errorJson(404, "CV_GENERATION_NOT_FOUND", "CV generation not found");
		}
		return HttpResponse.json(toPublicCvGeneration(generation));
	}),

	http.post(`${API_BASE_URL}/cv-generations`, async ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
		if (!idempotencyKey || idempotencyKey.length > 128) {
			return errorJson(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required");
		}
		const existing = state.cvGenerations.find(
			(generation) =>
				generation.userId === auth.user.userId && generation.idempotencyKey === idempotencyKey,
		);
		if (existing) {
			return HttpResponse.json(toPublicCvGeneration(existing), { status: 202 });
		}

		const body = await readJson<CreateCvGenerationRequest>(request);
		const consentResponse = ensureAiConsent(state, auth.user.userId, body.consentAccepted === true);
		if (consentResponse) return consentResponse;

		if (!body.jobDescription?.trim()) {
			return errorJson(400, "MISSING_JOB_DESCRIPTION", "A Job Description is required to generate a CV");
		}
		if (body.jobDescription.length > MAX_JOB_DESCRIPTION_CHARS) {
			return errorJson(
				400,
				"JOB_DESCRIPTION_TOO_LONG",
				"Job Description must not exceed 50000 characters",
			);
		}
		if (
			body.additionalInformation &&
			body.additionalInformation.length > MAX_ADDITIONAL_INFO_CHARS
		) {
			return errorJson(
				400,
				"ADDITIONAL_INFORMATION_TOO_LONG",
				"Additional information must not exceed 5000 characters",
			);
		}
		if (!isGeneratedFormat(body.format)) {
			return errorJson(
				400,
				"INVALID_GENERATION_FORMAT",
				"Generated CV format must be PDF, DOCX, or MARKDOWN",
			);
		}

		const application = requireApplicationForUser(state, auth.user.userId, body.applicationId);
		if (!application) {
			return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
		}
		const baseCv = state.baseCvs.find(
			(candidate) =>
				candidate.baseCvId === body.baseCvId && candidate.userId === auth.user.userId,
		);
		if (!baseCv) {
			return errorJson(
				400,
				"BASE_CV_UNAVAILABLE",
				"Selected Base CV is unavailable or not owned by you",
			);
		}
		const ownedCvs = state.applicationCvs.filter(
			(applicationCv) => applicationCv.applicationId === application.applicationId,
		);
		if (ownedCvs.length >= MAX_APPLICATION_CVS) {
			return errorJson(
				409,
				"GENERATION_LIMIT_REACHED",
				"The limit of 20 generated CVs for this Application has been reached",
			);
		}

		const jobDescriptionText = body.jobDescription.trim();
		const existingJobDescription = state.jobDescriptions.find(
			(jobDescription) =>
				jobDescription.applicationId === application.applicationId &&
				jobDescription.userId === auth.user.userId,
		);
		if (existingJobDescription) {
			existingJobDescription.jobDescriptionText = jobDescriptionText;
		} else {
			state.jobDescriptions.push({
				applicationId: application.applicationId,
				userId: auth.user.userId,
				jobDescriptionText,
			});
		}

		const timestamp = nowIso();
		const cvGenerationId = nextId(state, "cvGenerationId");
		const generation: MockCvGenerationRecord = {
			cvGenerationId,
			userId: auth.user.userId,
			applicationId: application.applicationId,
			baseCvId: baseCv.baseCvId,
			requestedFormat: body.format,
			status: "PENDING",
			idempotencyKey,
			correlationId: crypto.randomUUID(),
			errorCode: null,
			errorMessage: null,
			applicationCvId: null,
			modelId: null,
			workflowVersion: null,
			createdAt: timestamp,
			updatedAt: timestamp,
			startedAt: null,
			completedAt: null,
			statusUrl: `/api/v1/cv-generations/${cvGenerationId}`,
			jobDescriptionSnapshot: jobDescriptionText,
			additionalInformation: body.additionalInformation?.trim() || null,
			consentVersion: MOCK_AI_CONSENT_VERSION,
			attemptCount: 0,
			maxAttempts: 3,
		};
		state.cvGenerations.push(generation);
		saveState(state);
		return HttpResponse.json(toPublicCvGeneration(generation), { status: 202 });
	}),

	http.post(`${API_BASE_URL}/cv-generations/:cvGenerationId/cancel`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const cvGenerationId = getPositiveId(params, "cvGenerationId");
		const generation = state.cvGenerations.find(
			(candidate) =>
				candidate.cvGenerationId === cvGenerationId && candidate.userId === auth.user.userId,
		);
		if (!generation) {
			return errorJson(404, "CV_GENERATION_NOT_FOUND", "CV generation not found");
		}
		if (generation.status !== "PENDING") {
			return errorJson(
				409,
				"INVALID_STATUS_TRANSITION",
				"This generation cannot be cancelled in its current status",
			);
		}
		const timestamp = nowIso();
		generation.status = "CANCELLED";
		generation.completedAt = timestamp;
		generation.updatedAt = timestamp;
		generation.errorCode = "CANCELLED";
		generation.errorMessage = "Generation cancelled by user";
		saveState(state);
		return HttpResponse.json(toPublicCvGeneration(generation));
	}),

	http.get(`${API_BASE_URL}/ai-consent`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		return HttpResponse.json(getAiConsentForUser(state, auth.user.userId));
	}),

	http.post(`${API_BASE_URL}/ai-consent`, async ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const body = await readJson<{ accepted?: boolean }>(request);
		if (body.accepted !== true) {
			return errorJson(
				403,
				"AI_CONSENT_REQUIRED",
				"Explicit consent is required before sending CV data to Google Gemini",
			);
		}
		const consentResponse = ensureAiConsent(state, auth.user.userId, true);
		if (consentResponse) return consentResponse;
		saveState(state);
		return HttpResponse.json(getAiConsentForUser(state, auth.user.userId));
	}),

	http.get(`${API_BASE_URL}/applications/:applicationId/job-description`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationId = getPositiveId(params, "applicationId");
		const application = requireApplicationForUser(state, auth.user.userId, applicationId);
		if (!application) {
			return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
		}
		const jobDescription = state.jobDescriptions.find(
			(candidate) =>
				candidate.applicationId === application.applicationId &&
				candidate.userId === auth.user.userId,
		);
		return HttpResponse.json({
			applicationId: application.applicationId,
			jobDescriptionText: jobDescription?.jobDescriptionText ?? "",
		});
	}),

	http.get(`${API_BASE_URL}/applications/:applicationId/application-cvs`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationId = getPositiveId(params, "applicationId");
		const application = requireApplicationForUser(state, auth.user.userId, applicationId);
		if (!application) {
			return errorJson(404, "APPLICATION_NOT_FOUND", "Application not found");
		}
		return HttpResponse.json(
			state.applicationCvs
				.filter(
					(applicationCv) =>
						applicationCv.applicationId === application.applicationId &&
						applicationCv.userId === auth.user.userId,
				)
				.toSorted((left, right) => right.version - left.version)
				.map(
					({
						applicationCvId,
						applicationId: ownedApplicationId,
						version,
						originalFilename,
						format,
						contentType,
						byteSize,
						generationId,
						createdAt,
					}) => ({
						applicationCvId,
						applicationId: ownedApplicationId,
						version,
						originalFilename,
						format,
						contentType,
						byteSize,
						generationId,
						createdAt,
					}),
				),
		);
	}),

	http.get(`${API_BASE_URL}/application-cvs/:applicationCvId/download`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationCvId = getPositiveId(params, "applicationCvId");
		const applicationCv = state.applicationCvs.find(
			(candidate) =>
				candidate.applicationCvId === applicationCvId && candidate.userId === auth.user.userId,
		);
		if (!applicationCv) {
			return errorJson(404, "APPLICATION_CV_NOT_FOUND", "Generated Application CV not found");
		}
		const body = `Mock download for ${applicationCv.originalFilename}`;
		const uri = `data:${applicationCv.contentType};charset=utf-8,${encodeURIComponent(body)}`;
		return HttpResponse.json({ uri });
	}),

	http.delete(`${API_BASE_URL}/application-cvs/:applicationCvId`, ({ request, params }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		const applicationCvId = getPositiveId(params, "applicationCvId");
		const index = state.applicationCvs.findIndex(
			(candidate) =>
				candidate.applicationCvId === applicationCvId && candidate.userId === auth.user.userId,
		);
		if (index < 0) {
			return errorJson(404, "APPLICATION_CV_NOT_FOUND", "Generated Application CV not found");
		}
		const [removed] = state.applicationCvs.splice(index, 1);
		state.cvGenerations.forEach((generation) => {
			if (generation.applicationCvId === removed.applicationCvId) {
				generation.applicationCvId = null;
			}
		});
		saveState(state);
		return new HttpResponse(null, { status: 204 });
	}),
];
