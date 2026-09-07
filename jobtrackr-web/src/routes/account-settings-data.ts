import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/account-settings";
import { ApiError, api, requireSession } from "@/lib/api";
import { consumeOAuthResultParam, type OAuthResultCode } from "@/lib/google-auth";
import type { SignInMethods } from "@/types/sign-in-methods";

export type AccountSettingsActionData = {
	ok: boolean;
	formError?: string;
	fieldErrors?: Record<string, string>;
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
	const trimmedDisplayName = String(formData.get("displayName") ?? "").trim();

	if (trimmedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
		return {
			ok: false,
			fieldErrors: {
				displayName: "Display name must be at most 160 characters.",
			},
		};
	}

	try {
		await api.patchUser({
			displayName: trimmedDisplayName.length === 0 ? null : trimmedDisplayName,
		});
		return { ok: true };
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				ok: false,
				formError: error.message,
				fieldErrors: error.fieldErrors,
			};
		}

		return {
			ok: false,
			formError:
				error instanceof Error
					? error.message
					: "Could not save Profile. Check your connection and try again.",
		};
	}
}
