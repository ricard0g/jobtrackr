export type AuthProviders = {
	google: boolean;
};

export const OAUTH_RESULT_CODES = [
	"cancelled",
	"expired",
	"unavailable",
	"failed",
	"conflict",
	"mismatch",
	"not_registered",
	"registration_used",
	"registration_expired",
] as const;

export type OAuthResultCode = (typeof OAUTH_RESULT_CODES)[number];

const oauthResultMessages: Record<OAuthResultCode, string> = {
	cancelled: "Google sign-in was cancelled.",
	expired: "This Google sign-in expired. Please try again.",
	unavailable: "Google sign-in is currently unavailable.",
	failed: "Google sign-in failed. Try again or use your password.",
	conflict:
		"This Google identity is not linked to your JobTrackr User. Sign in with your password to connect it.",
	mismatch: "That Google identity does not match your Primary Email.",
	not_registered:
		"No JobTrackr User uses this Google account. Buy the weekly subscription to register, or sign in with your password.",
	registration_used:
		"This purchase was already used to create a User. Sign in instead.",
	registration_expired:
		"This purchase can no longer create a User because its paid week has ended or payment is no longer current. Registration requires a new purchase.",
};

const registrationResultMessages: Partial<Record<OAuthResultCode, string>> = {
	mismatch:
		"That Google account's verified email does not match your Checkout Email. Choose the Google account that uses your Checkout Email.",
	conflict:
		"A JobTrackr User already uses this email or Google account. Sign in instead; registration never links existing Users.",
	not_registered:
		"Start Google registration from your payment confirmation or registration email.",
};

export function parseOAuthResult(value: string | null | undefined): OAuthResultCode | null {
	if (!value) {
		return null;
	}
	return OAUTH_RESULT_CODES.includes(value as OAuthResultCode)
		? (value as OAuthResultCode)
		: null;
}

export function oauthResultMessage(
	code: OAuthResultCode,
	screen: "login" | "register" = "login",
): string {
	return (
		(screen === "register" ? registrationResultMessages[code] : undefined) ??
		oauthResultMessages[code]
	);
}

const OAUTH_RESULT_FLASH_KEY = "jobtrackr.oauthResult";

export function consumeOAuthResultParam(url: URL): {
	result: OAuthResultCode | null;
	redirectHref: string | null;
} {
	const incomingResult = parseOAuthResult(url.searchParams.get("oauthResult"));
	if (incomingResult) {
		sessionStorage.setItem(OAUTH_RESULT_FLASH_KEY, incomingResult);
		url.searchParams.delete("oauthResult");
		return {
			result: null,
			redirectHref: `${url.pathname}${url.search}${url.hash}`,
		};
	}

	const flashedResult = parseOAuthResult(sessionStorage.getItem(OAUTH_RESULT_FLASH_KEY));
	if (flashedResult) {
		sessionStorage.removeItem(OAUTH_RESULT_FLASH_KEY);
	}

	return { result: flashedResult, redirectHref: null };
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

export function googleLinkAuthorizationHref(authorizationBaseUrl: string): string {
	return googleAuthorizationHref("login", "/settings/account", authorizationBaseUrl);
}

export function googleCreatePasswordAuthorizationHref(authorizationBaseUrl: string): string {
	return googleLinkAuthorizationHref(authorizationBaseUrl);
}

const CREATE_PASSWORD_FLASH_KEY = "jobtrackr.createPassword";

export function consumeCreatePasswordParam(url: URL): {
	ready: boolean;
	redirectHref: string | null;
} {
	const incoming = url.searchParams.get("createPassword");
	if (incoming === "1") {
		sessionStorage.setItem(CREATE_PASSWORD_FLASH_KEY, "1");
		url.searchParams.delete("createPassword");
		return {
			ready: false,
			redirectHref: `${url.pathname}${url.search}${url.hash}`,
		};
	}

	const flashed = sessionStorage.getItem(CREATE_PASSWORD_FLASH_KEY) === "1";
	return { ready: flashed, redirectHref: null };
}

export function clearCreatePasswordReady() {
	sessionStorage.removeItem(CREATE_PASSWORD_FLASH_KEY);
}

export function redirectToGoogleAuthorization(href: string) {
	window.location.assign(href);
}
