import type { ActionFunctionArgs, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { ACCOUNT_SETTINGS_PATH } from "@/lib/account-settings";
import { api, logout, requireSession, type AccountLoaderData, type EntitlementLoaderData, type KanbanLoaderData } from "@/lib/api";
import { buildBoardGenerationReminders } from "@/lib/board-generation-reminders";

export async function appLoader({ request }: LoaderFunctionArgs): Promise<AccountLoaderData> {
	await requireSession(request);
	const [user, entitlement] = await Promise.all([api.getCurrentUser(), api.getEntitlement()]);
	return { user, entitlement, entitlementCheckedAt: Date.now() };
}

export async function kanbanLoader(): Promise<KanbanLoaderData> {
	await requireSession();
	const [applications, tags, generations] = await Promise.all([
		api.getApplications(),
		api.getTags(),
		api.getCvGenerations().catch(() => []),
	]);
	return {
		applications,
		tags,
		generationReminders: buildBoardGenerationReminders(generations),
	};
}

export async function protectedRouteLoader() {
	await requireSession();
	return null;
}

export async function appAction({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "");

	if (intent === "logout") {
		await logout();
		return redirect("/auth/login");
	}

	throw new Response("Unsupported action", { status: 400 });
}

export function appShouldRevalidate({
	actionResult,
	formAction,
	currentUrl,
	nextUrl,
	defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
	if (
		actionResult &&
		typeof actionResult === "object" &&
		"intent" in actionResult &&
		actionResult.intent === "createTag" &&
		"ok" in actionResult &&
		actionResult.ok === true
	) {
		return true;
	}

	if (formAction?.startsWith("/applications/")) {
		return false;
	}

	if (formAction) {
		let settingsAction: boolean;
		try {
			settingsAction =
				new URL(formAction, "http://localhost").pathname === ACCOUNT_SETTINGS_PATH;
		} catch {
			settingsAction = false;
		}
		if (settingsAction) {
			return true;
		}
	}

	const isCurrentBoardRoute =
		currentUrl.pathname === "/" ||
		currentUrl.pathname.startsWith("/applications/");
	const isNextBoardRoute =
		nextUrl.pathname === "/" || nextUrl.pathname.startsWith("/applications/");

	if (isCurrentBoardRoute && isNextBoardRoute) {
		return false;
	}

	return defaultShouldRevalidate;
}

export async function entitlementLoader(): Promise<EntitlementLoaderData> {
	await requireSession();
	const entitlement = await api.getEntitlement();
	return { entitlement, entitlementCheckedAt: Date.now() };
}
