const legacyApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const configuredOrigin = import.meta.env.VITE_API_ORIGIN as string | undefined;
const isMocking = import.meta.env.VITE_API_MOCKING === "true";

const resolvedOrigin = (
	isMocking
		? ""
		: (configuredOrigin ??
			legacyApiUrl?.replace(/\/api\/v1\/?$/, "") ??
			"http://localhost:8080")
).replace(/\/$/, "");

export const API_ORIGIN = resolvedOrigin;
export const API_BASE_URL = resolvedOrigin ? `${resolvedOrigin}/api/v1` : "/api/v1";
export const AUTH_BASE_URL = resolvedOrigin ? `${resolvedOrigin}/auth` : "/auth";
