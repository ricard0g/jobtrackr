import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { api, logout, requireSession, type AppLoaderData } from "@/lib/api";

export async function appLoader(): Promise<AppLoaderData> {
	await requireSession();

	const [user, applications, companies, tags] = await Promise.all([
		api.getCurrentUser(),
		api.getApplications(),
		api.getCompanies(),
		api.getTags(),
	]);

	return { user, applications, companies, tags };
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
