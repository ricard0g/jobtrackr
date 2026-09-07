import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { ApiError, getAuthProviders, login, register } from "@/lib/api";
import { redirectPathAfterAuth } from "@/lib/account-settings";
import { passwordPolicyError } from "@/lib/password-policy";
import {
	consumeOAuthResultParam,
	type OAuthResultCode,
} from "@/lib/google-auth";
import type { AuthActionData, LoginRequest, RegisterRequest } from "@/types/auth";

export type PublicAuthLoaderData = {
	google: boolean;
	oauthResult: OAuthResultCode | null;
};

export async function publicAuthLoader({
	request,
}: LoaderFunctionArgs): Promise<PublicAuthLoaderData> {
	const url = new URL(request.url);
	const oauth = consumeOAuthResultParam(url);
	if (oauth.redirectHref) {
		throw redirect(oauth.redirectHref);
	}

	return {
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
		await register({
			email,
			password,
			displayName: displayName || undefined,
		} satisfies RegisterRequest);
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
