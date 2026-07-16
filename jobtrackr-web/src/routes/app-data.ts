import type { ActionFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { api, logout, requireSession, type AccountLoaderData, type KanbanLoaderData } from "@/lib/api";

export async function appLoader(): Promise<AccountLoaderData> {
	await requireSession();
	return { user: await api.getCurrentUser() };
}

export async function kanbanLoader(): Promise<KanbanLoaderData> {
	await requireSession();
	const [applications, tags] = await Promise.all([
		api.getApplications(),
		api.getTags(),
	]);
	return { applications, tags };
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
