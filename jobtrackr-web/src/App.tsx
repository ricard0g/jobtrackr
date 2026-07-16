import "./App.css";
import { Outlet, useLoaderData } from "react-router";

import { Navbar } from "@/components/shared/Navbar";
import type { AccountLoaderData } from "@/lib/api";

function App() {
	const { user } = useLoaderData() as AccountLoaderData;

	return (
		<section className="flex h-dvh w-full flex-col overflow-hidden bg-bg md:min-h-screen">
			<Navbar user={user} />
			<main className="min-h-0 flex-1 overflow-hidden">
				<Outlet />
			</main>
		</section>
	);
}

export default App;
