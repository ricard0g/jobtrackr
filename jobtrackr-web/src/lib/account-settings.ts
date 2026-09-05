export const ACCOUNT_SETTINGS_PATH = "/settings/account";
export const ACCOUNT_MENU_BUTTON_LABEL = "Open account menu";
export const DISPLAY_NAME_MAX_LENGTH = 160;

type LocationLike = {
	pathname: string;
	mask?: { pathname: string } | null;
};

export function isAccountSettingsLocation(location: LocationLike): boolean {
	return (
		location.pathname === ACCOUNT_SETTINGS_PATH ||
		location.mask?.pathname === ACCOUNT_SETTINGS_PATH
	);
}

export function sanitizeReturnTo(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	let decoded = value;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		return null;
	}

	if (decoded !== ACCOUNT_SETTINGS_PATH) {
		return null;
	}

	return ACCOUNT_SETTINGS_PATH;
}

export function loginPathForRequest(request: Request): string {
	const pathname = new URL(request.url).pathname;
	const returnTo = sanitizeReturnTo(pathname);
	if (!returnTo) {
		return "/auth/login";
	}

	return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function redirectPathAfterAuth(request: Request): string {
	const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"));
	return returnTo ?? "/";
}
