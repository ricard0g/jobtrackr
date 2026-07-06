import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import "./index.css";
import App from "./App.tsx";
import RootErrorBoundary from "@/routes/RootErrorBoundary";
import RouteHydrateFallback from "@/routes/RouteHydrateFallback";
import { appAction, appLoader, appShouldRevalidate } from "@/routes/app-data";
import {
	ApplicationDetailErrorBoundary,
	ApplicationDetailRoute,
} from "@/routes/ApplicationDetailRoute";
import {
	applicationDetailAction,
	applicationDetailLoader,
	applicationDetailShouldRevalidate,
} from "@/routes/application-detail-data";
import { loginAction, publicAuthLoader, registerAction } from "@/routes/auth-data";
import { LoginPage, RegisterPage } from "@/routes/auth";

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
		path: "/",
		Component: App,
		loader: appLoader,
		action: appAction,
		shouldRevalidate: appShouldRevalidate,
		ErrorBoundary: RootErrorBoundary,
		HydrateFallback: RouteHydrateFallback,
		children: [
			{
				path: "applications/:applicationId",
				Component: ApplicationDetailRoute,
				loader: applicationDetailLoader,
				action: applicationDetailAction,
				shouldRevalidate: applicationDetailShouldRevalidate,
				ErrorBoundary: ApplicationDetailErrorBoundary,
			},
		],
	},
]);

async function enableMocking() {
	if (
		!import.meta.env.DEV ||
		import.meta.env.VITE_API_MOCKING !== "true" ||
		typeof window === "undefined"
	) {
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
