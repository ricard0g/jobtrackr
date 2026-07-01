import "./App.css";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { Navbar } from "./components/shared/Navbar";

function App() {
	return (
		<section className="min-h-screen w-full overflow-hidden bg-bg">
			<Navbar />
			<main>
				<KanbanBoard />
			</main>
		</section>
	);
}

export default App;
