import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { ApiError, login, register } from "@/lib/api";
import type { AuthActionData, LoginRequest, RegisterRequest } from "@/types/auth";

export function publicAuthLoader() {
	return null;
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
		return redirect("/");
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				formError: error.message,
				fieldErrors: error.fieldErrors,
				values: { email },
			} satisfies AuthActionData;
		}

		throw error;
	}
}

export async function registerAction({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const displayName = String(formData.get("displayName") ?? "").trim();
	const fieldErrors: Record<string, string> = {};

	if (!email) fieldErrors.email = "Email is required.";
	if (password.length < 8) {
		fieldErrors.password = "Password must be at least 8 characters.";
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
		return redirect("/");
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				formError: error.message,
				fieldErrors: error.fieldErrors,
				values: { email, displayName },
			} satisfies AuthActionData;
		}

		throw error;
	}
}
