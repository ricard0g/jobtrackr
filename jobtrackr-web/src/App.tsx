import "./App.css";
import { useEffect } from "react";
import { Outlet, useLoaderData, useLocation, useFetcher } from "react-router";

import { Navbar } from "@/components/shared/Navbar";
import { isAccountSettingsLocation } from "@/lib/account-settings";
import { EntitlementContext } from "@/lib/entitlement";
import type { AccountLoaderData, EntitlementLoaderData } from "@/lib/api";
import { AccountSettingsDialog } from "@/routes/AccountSettingsRoute";

const ENTITLEMENT_REFRESH_INTERVAL_MS = 30_000;

function App() {
	const initialData = useLoaderData() as AccountLoaderData;
	const { user } = initialData;
	const location = useLocation();
	const entitlementFetcher = useFetcher<EntitlementLoaderData>();
	const latestData = entitlementFetcher.data &&
		entitlementFetcher.data.entitlementCheckedAt >= initialData.entitlementCheckedAt
		? entitlementFetcher.data
		: initialData;
	const { entitlement } = latestData;

	useEffect(() => {
		const refresh = () => {
			if (document.visibilityState === "visible" && entitlementFetcher.state === "idle") {
				void entitlementFetcher.load("/resources/entitlement");
			}
		};
		const interval = window.setInterval(refresh, ENTITLEMENT_REFRESH_INTERVAL_MS);
		const remaining = entitlement.paidUntil ? Date.parse(entitlement.paidUntil) - Date.now() : null;
		const expiry = remaining !== null && remaining > 0 && remaining < ENTITLEMENT_REFRESH_INTERVAL_MS
			? window.setTimeout(refresh, remaining)
			: undefined;
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			window.clearInterval(interval);
			window.clearTimeout(expiry);
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, [entitlement.paidUntil, entitlementFetcher]);
	const accountSettingsOpen = isAccountSettingsLocation(location);

	return (
		<EntitlementContext value={entitlement}>
			<section className="flex h-dvh w-full flex-col overflow-hidden bg-bg md:min-h-screen">
				<Navbar user={user} />
				<div role="status" className="shrink-0 border-b border-light-gray px-8 py-2 text-sm">
					{entitlement.access === "PAID" ? (
						<span>Paid access</span>
					) : (
						<>
							<strong>Limited Access</strong>{" — "}
							Your existing Applications remain available to view and edit. You can also
							add Interviews, create and attach Tags, and preview saved Generated CVs.
							Creating new Applications, uploading Base CVs, and starting CV Generation require current paid access.
						</>
					)}
				</div>
				<main className="min-h-0 flex-1 overflow-hidden">
					<Outlet />
				</main>
				{accountSettingsOpen ? <AccountSettingsDialog /> : null}
			</section>
		</EntitlementContext>
	);
}

export default App;
