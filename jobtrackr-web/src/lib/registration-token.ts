const STORAGE_KEY = "jobtrackr-registration-token";
const CHECKOUT_STORAGE_KEY = "jobtrackr-registration-checkout-token";
const FRAGMENTS = [
	["#verify=", STORAGE_KEY],
	["#checkout=", CHECKOUT_STORAGE_KEY],
] as const;

export function captureRegistrationToken() {
	if (window.location.pathname !== "/auth/register") return;
	for (const [prefix, key] of FRAGMENTS) {
		if (window.location.hash.startsWith(prefix)) {
			sessionStorage.setItem(key, window.location.hash.slice(prefix.length));
			window.history.replaceState(
				null,
				"",
				window.location.pathname + window.location.search,
			);
		}
	}
}

export function getRegistrationToken() {
	return sessionStorage.getItem(STORAGE_KEY);
}

export function getCheckoutRegistrationToken() {
	return sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
}

export function clearRegistrationToken() {
	sessionStorage.removeItem(STORAGE_KEY);
	sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
}
