export type AuthProviders = {
	google: boolean;
};

export const OAUTH_RESULT_CODES = [
	"cancelled",
	"expired",
	"unavailable",
	"failed",
	"conflict",
] as const;

export type OAuthResultCode = (typeof OAUTH_RESULT_CODES)[number];

const oauthResultMessages: Record<OAuthResultCode, string> = {
	cancelled: "Google sign-in was cancelled.",
	expired: "This Google sign-in expired. Please try again.",
	unavailable: "Google sign-in is currently unavailable.",
	failed: "Google sign-in failed. Try again or use your password.",
	conflict:
		"This Google identity is not linked to your JobTrackr User. Sign in with your password to connect it.",
};

export function parseOAuthResult(value: string | null | undefined): OAuthResultCode | null {
	if (!value) {
		return null;
	}
	return OAUTH_RESULT_CODES.includes(value as OAuthResultCode)
		? (value as OAuthResultCode)
		: null;
}

export function oauthResultMessage(code: OAuthResultCode): string {
	return oauthResultMessages[code];
}

const ALLOWED_RETURN_TO = new Set(["/", "/documents", "/settings/account"]);

export function sanitizeOauthReturnTo(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	return ALLOWED_RETURN_TO.has(value) ? value : null;
}

export function googleAuthorizationHref(
	screen: "login" | "register",
	returnTo: string | null | undefined,
	authorizationBaseUrl: string,
): string {
	const params = new URLSearchParams();
	if (screen === "register") {
		params.set("screen", "register");
	}
	const safeReturnTo = sanitizeOauthReturnTo(returnTo);
	if (safeReturnTo) {
		params.set("returnTo", safeReturnTo);
	}
	const query = params.toString();
	return query
		? `${authorizationBaseUrl}?${query}`
		: authorizationBaseUrl;
}
