import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/account-settings";
import { ApiError, api, requireSession } from "@/lib/api";
import { AUTH_BASE_URL } from "@/lib/api-config";
import { passwordPolicyError } from "@/lib/password-policy";
import {
	consumeOAuthResultParam,
	googleLinkAuthorizationHref,
	type OAuthResultCode,
} from "@/lib/google-auth";
import type { SignInMethods } from "@/types/sign-in-methods";

export type AccountSettingsActionIntent = "profile" | "google-link" | "change-password";

export type AccountSettingsActionData = {
	ok: boolean;
	intent: AccountSettingsActionIntent;
	formError?: string;
	fieldErrors?: Record<string, string>;
	googleAuthorizationHref?: string;
};

export type AccountSettingsLoaderData = {
	signInMethods: SignInMethods;
	oauthResult: OAuthResultCode | null;
};

export async function accountSettingsLoader({
	request,
}: LoaderFunctionArgs): Promise<AccountSettingsLoaderData> {
	await requireSession(request);
	const url = new URL(request.url);
	const oauth = consumeOAuthResultParam(url);
	if (oauth.redirectHref) {
		throw redirect(oauth.redirectHref);
	}

	return {
		signInMethods: await api.getSignInMethods(),
		oauthResult: oauth.result,
	};
}

export async function accountSettingsAction({
	request,
}: ActionFunctionArgs): Promise<AccountSettingsActionData> {
	await requireSession(request);
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "profile");
	if (intent === "google-link") {
		return beginGoogleLink(formData);
	}
	if (intent === "change-password") {
		return changePassword(formData);
	}
	return saveProfile(formData);
}

async function saveProfile(formData: FormData): Promise<AccountSettingsActionData> {
	const trimmedDisplayName = String(formData.get("displayName") ?? "").trim();

	if (trimmedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
		return {
			ok: false,
			intent: "profile",
			fieldErrors: {
				displayName: "Display name must be at most 160 characters.",
			},
		};
	}

	try {
		await api.patchUser({
			displayName: trimmedDisplayName.length === 0 ? null : trimmedDisplayName,
		});
		return { ok: true, intent: "profile" };
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				ok: false,
				intent: "profile",
				formError: error.message,
				fieldErrors: error.fieldErrors,
			};
		}

		return {
			ok: false,
			intent: "profile",
			formError:
				error instanceof Error
					? error.message
					: "Could not save Profile. Check your connection and try again.",
		};
	}
}

async function beginGoogleLink(formData: FormData): Promise<AccountSettingsActionData> {
	const currentPassword = String(formData.get("currentPassword") ?? "");
	if (currentPassword.length === 0) {
		return {
			ok: false,
			intent: "google-link",
			fieldErrors: {
				currentPassword: "Current password is required.",
			},
		};
	}

	try {
		await api.createGoogleLinkIntent(currentPassword);
		return {
			ok: true,
			intent: "google-link",
			googleAuthorizationHref: googleLinkAuthorizationHref(
				`${AUTH_BASE_URL}/oauth2/authorization/google`,
			),
		};
	} catch (error) {
		if (error instanceof ApiError) {
			if (error.code === "INVALID_CREDENTIALS") {
				return {
					ok: false,
					intent: "google-link",
					fieldErrors: {
						currentPassword: "Current password is incorrect.",
					},
				};
			}
			return {
				ok: false,
				intent: "google-link",
				formError: error.message,
				fieldErrors: error.fieldErrors,
			};
		}

		return {
			ok: false,
			intent: "google-link",
			formError:
				error instanceof Error
					? error.message
					: "Could not connect Google. Check your connection and try again.",
		};
	}
}

async function changePassword(formData: FormData): Promise<AccountSettingsActionData> {
	const currentPassword = String(formData.get("currentPassword") ?? "");
	const newPassword = String(formData.get("newPassword") ?? "");
	const confirmPassword = String(formData.get("confirmPassword") ?? "");
	const fieldErrors: Record<string, string> = {};

	if (currentPassword.length === 0) {
		fieldErrors.currentPassword = "Current password is required.";
	}

	const policyError = passwordPolicyError(newPassword);
	if (policyError) {
		fieldErrors.newPassword = policyError;
	}

	if (newPassword !== confirmPassword) {
		fieldErrors.confirmPassword = "New password and confirmation must match.";
	}

	if (Object.keys(fieldErrors).length > 0) {
		return {
			ok: false,
			intent: "change-password",
			fieldErrors,
		};
	}

	try {
		await api.changePassword({ currentPassword, newPassword });
		return { ok: true, intent: "change-password" };
	} catch (error) {
		if (error instanceof ApiError) {
			if (error.code === "INVALID_CREDENTIALS") {
				return {
					ok: false,
					intent: "change-password",
					fieldErrors: {
						currentPassword: "Current password is incorrect.",
					},
				};
			}
			if (error.code === "PASSWORD_UNCHANGED") {
				return {
					ok: false,
					intent: "change-password",
					fieldErrors: {
						newPassword: error.message,
					},
				};
			}
			return {
				ok: false,
				intent: "change-password",
				formError: error.message,
				fieldErrors: error.fieldErrors,
			};
		}

		return {
			ok: false,
			intent: "change-password",
			formError:
				error instanceof Error
					? error.message
					: "Could not change password. Check your connection and try again.",
		};
	}
}

