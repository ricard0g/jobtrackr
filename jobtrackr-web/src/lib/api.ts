import { redirect } from "react-router";

import type {
	Application,
	ApplicationPatchRequest,
	ApplicationPutRequest,
	ApplicationStatus,
	ApplicationStatusPatchRequest,
	ApplicationCreateRequest,
	StatusHistory,
} from "@/types/application";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@/types/auth";
import type { Company, CompanyPage, CompanySearchParams, CompanyWriteRequest } from "@/types/company";
import type {
	Interview,
	InterviewCreateRequest,
	InterviewPutRequest,
} from "@/types/interview";
import { API_BASE_URL, AUTH_BASE_URL } from "@/lib/api-config";
import type { Tag, TagWriteRequest } from "@/types/tag";
import type { User } from "@/types/user";

let accessToken: string | null = null;
let csrfToken: string | null = null;
let csrfHeaderName = "X-XSRF-TOKEN";
let refreshPromise: Promise<AuthResponse> | null = null;

export class ApiError extends Error {
	status: number;
	code?: string;
	fieldErrors?: Record<string, string>;

	constructor(message: string, status: number, code?: string, fieldErrors?: Record<string, string>) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.fieldErrors = fieldErrors;
	}
}

type ErrorResponse = {
	code?: string;
	message?: string;
	fieldErrors?: Array<{ field: string; message: string }>;
	error?: string;
};

type CsrfResponse = {
	headerName?: string;
	token?: string;
};

const jsonHeaders = {
	Accept: "application/json",
	"Content-Type": "application/json",
};

export function setAccessToken(token: string | null) {
	accessToken = token;
}

export function clearAccessToken() {
	accessToken = null;
}

function toFieldErrors(fieldErrors: ErrorResponse["fieldErrors"]) {
	if (!fieldErrors) return undefined;

	return Object.fromEntries(
		fieldErrors.map((fieldError) => [fieldError.field, fieldError.message]),
	);
}

async function parseApiError(response: Response, fallback: string): Promise<ApiError> {
	try {
		const body = (await response.json()) as ErrorResponse;

		return new ApiError(
			body.message ?? body.error ?? fallback,
			response.status,
			body.code,
			toFieldErrors(body.fieldErrors),
		);
	} catch {
		return new ApiError(fallback, response.status);
	}
}

function isJsonBody(body: BodyInit | null | undefined): body is string {
	return typeof body === "string";
}

async function readJson<T>(response: Response): Promise<T> {
	if (response.status === 204) return undefined as T;

	return (await response.json()) as T;
}

async function getCsrfToken() {
	if (csrfToken) {
		return { headerName: csrfHeaderName, token: csrfToken };
	}

	const response = await fetch(`${AUTH_BASE_URL}/csrf`, {
		credentials: "include",
		headers: { Accept: "application/json" },
	});

	if (!response.ok) {
		throw await parseApiError(response, "No se pudo inicializar la sesion.");
	}

	const body = (await response.json()) as CsrfResponse;
	csrfToken = body.token ?? null;
	csrfHeaderName = body.headerName ?? csrfHeaderName;

	if (!csrfToken) {
		throw new ApiError("No se pudo inicializar la sesion.", response.status);
	}

	return { headerName: csrfHeaderName, token: csrfToken };
}

async function authRequest<T>(
	path: string,
	init: RequestInit = {},
	requiresCsrf = false,
): Promise<T> {
	const headers = new Headers(init.headers);

	if (init.body && !headers.has("Content-Type") && isJsonBody(init.body)) {
		headers.set("Content-Type", "application/json");
	}
	if (!headers.has("Accept")) headers.set("Accept", "application/json");

	if (requiresCsrf) {
		const csrf = await getCsrfToken();
		headers.set(csrf.headerName, csrf.token);
	}

	const response = await fetch(`${AUTH_BASE_URL}${path}`, {
		...init,
		headers,
		credentials: "include",
	});

	if (!response.ok) {
		throw await parseApiError(response, "No se pudo completar la autenticacion.");
	}

	return readJson<T>(response);
}

export async function login(request: LoginRequest) {
	const response = await authRequest<AuthResponse>("/login", {
		method: "POST",
		headers: jsonHeaders,
		body: JSON.stringify(request),
	});
	setAccessToken(response.accessToken);
	return response;
}

export async function register(request: RegisterRequest) {
	const response = await authRequest<AuthResponse>("/register", {
		method: "POST",
		headers: jsonHeaders,
		body: JSON.stringify(request),
	});
	setAccessToken(response.accessToken);
	return response;
}

export async function refreshSession() {
	if (!refreshPromise) {
		refreshPromise = authRequest<AuthResponse>(
			"/refresh",
			{ method: "POST", headers: jsonHeaders },
			true,
		)
			.then((response) => {
				setAccessToken(response.accessToken);
				return response;
			})
			.finally(() => {
				refreshPromise = null;
			});
	}

	return refreshPromise;
}

export async function logout() {
	try {
		await authRequest<void>("/logout", { method: "POST", headers: jsonHeaders }, true);
	} finally {
		clearAccessToken();
	}
}

async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
	const headers = new Headers(init.headers);

	if (!headers.has("Accept")) headers.set("Accept", "application/json");
	if (init.body && !headers.has("Content-Type") && isJsonBody(init.body)) {
		headers.set("Content-Type", "application/json");
	}
	if (accessToken) {
		headers.set("Authorization", `Bearer ${accessToken}`);
	}

	const response = await fetch(`${API_BASE_URL}${path}`, {
		...init,
		headers,
	});

	if (response.status === 401 && retry) {
		await refreshSession();
		return apiRequest<T>(path, init, false);
	}

	if (!response.ok) {
		throw await parseApiError(response, "No se pudo completar la solicitud.");
	}

	return readJson<T>(response);
}

export async function requireSession() {
	try {
		await refreshSession();
	} catch {
		throw redirect("/auth/login");
	}
}

export const api = {
	getCurrentUser: () => apiRequest<User>("/user"),
	getApplications: () => apiRequest<Application[]>("/applications"),
	getApplicationById: (applicationId: number) =>
		apiRequest<Application>(`/applications/${applicationId}`),
	searchCompanies: ({
		search = "",
		page = 0,
		size = 20,
		signal,
	}: CompanySearchParams = {}) => {
		const params = new URLSearchParams({
			search,
			page: String(page),
			size: String(size),
		});

		return apiRequest<CompanyPage>(`/companies?${params.toString()}`, { signal });
	},
	getCompanyById: (companyId: number) =>
		apiRequest<Company>(`/companies/${companyId}`),
	createCompany: (request: CompanyWriteRequest) =>
		apiRequest<Company>("/companies", {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	putCompany: (companyId: number, request: CompanyWriteRequest) =>
		apiRequest<Company>(`/companies/${companyId}`, {
			method: "PUT",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	deleteCompany: (companyId: number) =>
		apiRequest<void>(`/companies/${companyId}`, { method: "DELETE" }),
	getTags: () => apiRequest<Tag[]>("/tags"),
	getTagById: (tagId: number) => apiRequest<Tag>(`/tags/${tagId}`),
	createTag: (request: TagWriteRequest) =>
		apiRequest<Tag>("/tags", {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	putTag: (tagId: number, request: TagWriteRequest) =>
		apiRequest<Tag>(`/tags/${tagId}`, {
			method: "PUT",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	deleteTag: (tagId: number) =>
		apiRequest<void>(`/tags/${tagId}`, { method: "DELETE" }),
	createApplication: (request: ApplicationCreateRequest) =>
		apiRequest<Application>("/applications", {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	putApplication: (applicationId: number, request: ApplicationPutRequest) =>
		apiRequest<Application>(`/applications/${applicationId}`, {
			method: "PUT",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	patchApplication: (applicationId: number, request: ApplicationPatchRequest) =>
		apiRequest<Application>(`/applications/${applicationId}`, {
			method: "PATCH",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	patchApplicationStatus: (applicationId: number, request: ApplicationStatusPatchRequest) =>
		apiRequest<Application>(`/applications/${applicationId}/status`, {
			method: "PATCH",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	getApplicationStatusHistory: (applicationId: number) =>
		apiRequest<StatusHistory[]>(`/applications/${applicationId}/status-history`),
	createAndAttachTag: (applicationId: number, request: TagWriteRequest) =>
		apiRequest<Tag>(`/applications/${applicationId}/tags`, {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	deleteApplication: (applicationId: number) =>
		apiRequest<void>(`/applications/${applicationId}`, { method: "DELETE" }),
	getInterviews: (applicationId: number) =>
		apiRequest<Interview[]>(`/applications/${applicationId}/interviews`),
	getInterviewById: (applicationId: number, interviewId: number) =>
		apiRequest<Interview>(
			`/applications/${applicationId}/interviews/${interviewId}`,
		),
	createInterview: (applicationId: number, request: InterviewCreateRequest) =>
		apiRequest<Interview>(`/applications/${applicationId}/interviews`, {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
	putInterview: (
		applicationId: number,
		interviewId: number,
		request: InterviewPutRequest,
	) =>
		apiRequest<Interview>(
			`/applications/${applicationId}/interviews/${interviewId}`,
			{
				method: "PUT",
				headers: jsonHeaders,
				body: JSON.stringify(request),
			},
		),
	deleteInterview: (applicationId: number, interviewId: number) =>
		apiRequest<void>(`/applications/${applicationId}/interviews/${interviewId}`, {
			method: "DELETE",
		}),
	setApplicationStatus: (applicationId: number, applicationStatus: ApplicationStatus) =>
		api.patchApplicationStatus(applicationId, { applicationStatus }),
};

export type AppLoaderData = {
	user: User;
	applications: Application[];
	tags: Tag[];
};
