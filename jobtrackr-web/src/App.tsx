import "./App.css";
import { Outlet, useLoaderData } from "react-router";

import { BoardProvider } from "@/components/kanban/BoardProvider";
import type { AppLoaderData } from "@/lib/api";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { Navbar } from "./components/shared/Navbar";

function App() {
	const data = useLoaderData() as AppLoaderData;

	return (
		<BoardProvider data={data}>
			<section className="flex h-dvh w-full flex-col overflow-hidden bg-bg md:min-h-screen">
				<Navbar />
				<main className="min-h-0 flex-1 overflow-hidden">
					<KanbanBoard />
					<Outlet />
				</main>
			</section>
		</BoardProvider>
	);
}

export default App;
