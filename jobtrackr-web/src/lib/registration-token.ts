const STORAGE_KEY = "jobtrackr-registration-token";

export function captureRegistrationToken() {
	if (
		window.location.pathname === "/auth/register" &&
		window.location.hash.startsWith("#verify=")
	) {
		sessionStorage.setItem(
			STORAGE_KEY,
			window.location.hash.slice("#verify=".length),
		);
		window.history.replaceState(
			null,
			"",
			window.location.pathname + window.location.search,
		);
	}
}

export function getRegistrationToken() {
	return sessionStorage.getItem(STORAGE_KEY);
}

export function clearRegistrationToken() {
	sessionStorage.removeItem(STORAGE_KEY);
}
