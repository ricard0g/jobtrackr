import "./App.css";
import { Outlet, useLoaderData, useLocation } from "react-router";

import { Navbar } from "@/components/shared/Navbar";
import { isAccountSettingsLocation } from "@/lib/account-settings";
import type { AccountLoaderData } from "@/lib/api";
import { AccountSettingsDialog } from "@/routes/AccountSettingsRoute";

function App() {
	const { user } = useLoaderData() as AccountLoaderData;
	const location = useLocation();
	const accountSettingsOpen = isAccountSettingsLocation(location);

	return (
		<section className="flex h-dvh w-full flex-col overflow-hidden bg-bg md:min-h-screen">
			<Navbar user={user} />
			<main className="min-h-0 flex-1 overflow-hidden">
				<Outlet />
			</main>
			{accountSettingsOpen ? <AccountSettingsDialog /> : null}
		</section>
	);
}

export default App;
