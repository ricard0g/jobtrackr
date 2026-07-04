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
import type { InterviewCreateRequest, InterviewPutRequest } from "@/types/interview";
import type { TagWriteRequest } from "@/types/tag";
import type { User } from "@/types/user";

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

	http.get(`${API_BASE_URL}/companies`, ({ request }) => {
		const state = loadState();
		const auth = requireAuth(request, state);
		if (auth instanceof Response) return auth;
		return HttpResponse.json(getAccessibleCompanies(state, auth.user.userId));
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
		state.applications = state.applications.filter(
			(candidate) => candidate.applicationId !== application.applicationId,
		);
		state.interviews = state.interviews.filter(
			(interview) => interview.applicationId !== application.applicationId,
		);
		state.statusHistories = state.statusHistories.filter(
			(history) => history.applicationId !== application.applicationId,
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
];
