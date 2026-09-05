import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";

import "./index.css";
import App from "./App.tsx";
import RootErrorBoundary from "@/routes/RootErrorBoundary";
import RouteHydrateFallback from "@/routes/RouteHydrateFallback";
import { appAction, appLoader, appShouldRevalidate, kanbanLoader } from "@/routes/app-data";
import {
	ApplicationDetailErrorBoundary,
	ApplicationDetailRoute,
} from "@/routes/ApplicationDetailRoute";
import {
	applicationDetailAction,
	applicationDetailLoader,
	applicationDetailShouldRevalidate,
} from "@/routes/application-detail-data";
import {
	APPLICATION_GENERATE_ROUTE_ID,
	applicationGenerateAction,
	applicationGenerateLoader,
} from "@/routes/application-generate-data";
import { loginAction, publicAuthLoader, registerAction } from "@/routes/auth-data";
import { LoginPage, RegisterPage } from "@/routes/auth";
import { KanbanRoute } from "@/routes/KanbanRoute";
import { DocumentsRoute, DocumentsRouteHydrateFallback } from "@/routes/DocumentsRoute";
import {
	documentsAction,
	documentsLoader,
	documentsShouldRevalidate,
	DOCUMENTS_RECENT_ROUTE_ID,
	recentGeneratedCvsLoader,
	recentGeneratedCvsResourceLoader,
	recentGeneratedCvsShouldRevalidate,
} from "@/routes/documents-data";
import { accountSettingsAction } from "@/routes/account-settings-data";
import {
	AccountSettingsFallbackRoute,
} from "@/routes/AccountSettingsRoute";
import { generateHubRedirectLoader } from "@/routes/generate-hub-redirect";

const router = createBrowserRouter([
	{
		path: "/auth/login",
		Component: LoginPage,
		loader: publicAuthLoader,
		action: loginAction,
		ErrorBoundary: RootErrorBoundary,
		HydrateFallback: RouteHydrateFallback,
	},
	{
		path: "/auth/register",
		Component: RegisterPage,
		loader: publicAuthLoader,
		action: registerAction,
		ErrorBoundary: RootErrorBoundary,
		HydrateFallback: RouteHydrateFallback,
	},
	{
		id: "app",
		path: "/",
		Component: App,
		loader: appLoader,
		action: appAction,
		shouldRevalidate: appShouldRevalidate,
		ErrorBoundary: RootErrorBoundary,
		HydrateFallback: RouteHydrateFallback,
		children: [
			{
				id: "kanban",
				Component: KanbanRoute,
				loader: kanbanLoader,
				children: [
					{ index: true },
					{
						path: "applications/:applicationId",
						Component: ApplicationDetailRoute,
						loader: applicationDetailLoader,
						action: applicationDetailAction,
						shouldRevalidate: applicationDetailShouldRevalidate,
						ErrorBoundary: ApplicationDetailErrorBoundary,
						children: [
							{ index: true },
							{
								id: APPLICATION_GENERATE_ROUTE_ID,
								path: "generate",
								loader: applicationGenerateLoader,
								action: applicationGenerateAction,
							},
						],
					},
				],
			},
			{
				id: DOCUMENTS_RECENT_ROUTE_ID,
				path: "documents",
				Component: Outlet,
				loader: recentGeneratedCvsLoader,
				action: documentsAction,
				shouldRevalidate: recentGeneratedCvsShouldRevalidate,
				HydrateFallback: DocumentsRouteHydrateFallback,
				ErrorBoundary: RootErrorBoundary,
				children: [
					{
						index: true,
						Component: DocumentsRoute,
						loader: documentsLoader,
						shouldRevalidate: documentsShouldRevalidate,
					},
				],
			},
			{
				path: "settings/account",
				Component: AccountSettingsFallbackRoute,
				action: accountSettingsAction,
			},
			{
				path: "resources/documents/recent",
				loader: recentGeneratedCvsResourceLoader,
			},
			{
				path: "generate",
				loader: generateHubRedirectLoader,
			},
		],
	},
]);

async function enableMocking() {
	if (!import.meta.env.DEV || typeof window === "undefined") {
		return;
	}

	if (import.meta.env.VITE_API_MOCKING !== "true") {
		// Drop a stale MSW worker left over from an earlier mock-mode tunnel session.
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map((registration) => registration.unregister()));
		}
		return;
	}

	const { worker } = await import("@/mocks/browser");

	await worker.start({
		onUnhandledRequest: "bypass",
		serviceWorker: {
			url: "/mockServiceWorker.js",
		},
	});
}

await enableMocking();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
