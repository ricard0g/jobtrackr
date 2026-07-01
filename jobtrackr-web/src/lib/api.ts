import { redirect } from "react-router";

import type {
	Application,
	ApplicationPatchRequest,
	ApplicationStatus,
	ApplicationStatusPatchRequest,
	ApplicationCreateRequest,
} from "@/types/application";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@/types/auth";
import type { Company } from "@/types/company";
import type {
	Interview,
	InterviewCreateRequest,
} from "@/types/interview";
import type { Tag } from "@/types/tag";
import type { User } from "@/types/user";

const legacyApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const configuredOrigin = import.meta.env.VITE_API_ORIGIN as string | undefined;

const API_ORIGIN = (configuredOrigin ?? legacyApiUrl?.replace(/\/api\/v1\/?$/, "") ?? "http://localhost:8080").replace(
	/\/$/,
	"",
);

const API_BASE_URL = `${API_ORIGIN}/api/v1`;
const AUTH_BASE_URL = `${API_ORIGIN}/auth`;

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
	getCompanies: () => apiRequest<Company[]>("/companies"),
	getTags: () => apiRequest<Tag[]>("/tags"),
	createApplication: (request: ApplicationCreateRequest) =>
		apiRequest<Application>("/applications", {
			method: "POST",
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
	deleteApplication: (applicationId: number) =>
		apiRequest<void>(`/applications/${applicationId}`, { method: "DELETE" }),
	getInterviews: (applicationId: number) =>
		apiRequest<Interview[]>(`/applications/${applicationId}/interviews`),
	createInterview: (applicationId: number, request: InterviewCreateRequest) =>
		apiRequest<Interview>(`/applications/${applicationId}/interviews`, {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify(request),
		}),
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
	companies: Company[];
	tags: Tag[];
};
