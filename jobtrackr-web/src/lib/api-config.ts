const legacyApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const configuredOrigin = import.meta.env.VITE_API_ORIGIN as string | undefined;

export const API_ORIGIN = (
	configuredOrigin ??
	legacyApiUrl?.replace(/\/api\/v1\/?$/, "") ??
	"http://localhost:8080"
).replace(/\/$/, "");

export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
export const AUTH_BASE_URL = `${API_ORIGIN}/auth`;
