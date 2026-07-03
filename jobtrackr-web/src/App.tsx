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
			<section className="min-h-screen w-full overflow-hidden bg-bg">
				<Navbar />
				<main>
					<KanbanBoard />
					<Outlet />
				</main>
			</section>
		</BoardProvider>
	);
}

export default App;
