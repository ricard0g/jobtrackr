import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import {
	ApiError,
	createGoogleRegistrationIntent,
	getAuthProviders,
	getRegistrationClaim,
	getRegistrationVerification,
	login,
	register,
} from "@/lib/api";
import { AUTH_BASE_URL } from "@/lib/api-config";
import { redirectPathAfterAuth } from "@/lib/account-settings";
import { passwordPolicyError } from "@/lib/password-policy";
import {
	getCheckoutRegistrationToken,
	getRegistrationToken,
	clearRegistrationToken,
} from "@/lib/registration-token";
import {
	consumeOAuthResultParam,
	googleAuthorizationHref,
	type OAuthResultCode,
} from "@/lib/google-auth";
import type {
	AuthActionData,
	LoginRequest,
	RegisterRequest,
} from "@/types/auth";

export type PublicAuthLoaderData = {
	google: boolean;
	oauthResult: OAuthResultCode | null;
	registration: {
		email: string;
		paidUntil: string;
		passwordAllowed: boolean;
	} | null;
	registrationError: string | null;
};

export async function publicAuthLoader({
	request,
}: LoaderFunctionArgs): Promise<PublicAuthLoaderData> {
	const url = new URL(request.url);
	const oauth = consumeOAuthResultParam(url);
	if (oauth.redirectHref) {
		throw redirect(oauth.redirectHref);
	}

	let registration: PublicAuthLoaderData["registration"] = null;
	let registrationError: string | null = null;
	if (url.pathname === "/auth/register") {
		const token = getRegistrationToken();
		const checkoutToken = getCheckoutRegistrationToken();
		try {
			if (token) {
				registration = {
					...(await getRegistrationVerification(token)),
					passwordAllowed: true,
				};
			} else if (checkoutToken) {
				registration = {
					...(await getRegistrationClaim(checkoutToken)),
					passwordAllowed: false,
				};
			}
		} catch (error) {
			if (!(error instanceof ApiError) || error.status !== 403) {
				throw error;
			}
			registrationError = error.message;
		}
	}

	return {
		registration,
		registrationError,
		google: (await getAuthProviders()).google,
		oauthResult: oauth.result,
	};
}

export async function loginAction({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const fieldErrors: Record<string, string> = {};

	if (!email) fieldErrors.email = "Email is required.";
	if (!password) fieldErrors.password = "Password is required.";

	if (Object.keys(fieldErrors).length > 0) {
		return { fieldErrors, values: { email } } satisfies AuthActionData;
	}

	try {
		await login({ email, password } satisfies LoginRequest);
		return redirect(redirectPathAfterAuth(request));
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				formError: error.message,
				fieldErrors: error.fieldErrors,
				values: { email },
			} satisfies AuthActionData;
		}

		return {
			formError:
				error instanceof Error
					? error.message
					: "Could not reach the server. Check your connection and try again.",
			values: { email },
		} satisfies AuthActionData;
	}
}

export async function registerAction({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	if (formData.get("intent") === "google") {
		return startGoogleRegistration();
	}
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const displayName = String(formData.get("displayName") ?? "").trim();
	const fieldErrors: Record<string, string> = {};

	if (!email) fieldErrors.email = "Email is required.";
	const policyError = passwordPolicyError(password);
	if (policyError) {
		fieldErrors.password = policyError;
	}

	if (Object.keys(fieldErrors).length > 0) {
		return {
			fieldErrors,
			values: { email, displayName },
		} satisfies AuthActionData;
	}

	try {
		const verificationToken = getRegistrationToken();
		if (!verificationToken) {
			return {
				formError: "Open the verification link sent to your Checkout Email.",
			} satisfies AuthActionData;
		}
		await register({
			verificationToken,
			email,
			password,
			displayName: displayName || undefined,
		} satisfies RegisterRequest);
		clearRegistrationToken();
		return redirect(redirectPathAfterAuth(request));
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				formError: error.message,
				fieldErrors: error.fieldErrors,
				values: { email, displayName },
			} satisfies AuthActionData;
		}

		return {
			formError:
				error instanceof Error
					? error.message
					: "Could not reach the server. Check your connection and try again.",
			values: { email, displayName },
		} satisfies AuthActionData;
	}
}

async function startGoogleRegistration(): Promise<AuthActionData> {
	const verificationToken = getRegistrationToken();
	const checkoutToken = getCheckoutRegistrationToken();
	try {
		if (verificationToken) {
			await createGoogleRegistrationIntent({ verificationToken });
		} else if (checkoutToken) {
			await createGoogleRegistrationIntent({ checkoutToken });
		} else {
			return {
				formError:
					"Open your payment confirmation or registration email to continue.",
			};
		}
		return {
			googleAuthorizationHref: googleAuthorizationHref(
				"register",
				null,
				`${AUTH_BASE_URL}/oauth2/authorization/google`,
			),
		};
	} catch (error) {
		return {
			formError:
				error instanceof Error
					? error.message
					: "Could not reach the server. Check your connection and try again.",
		};
	}
}
