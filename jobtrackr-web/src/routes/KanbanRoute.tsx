import { Outlet, useLoaderData, useRouteLoaderData } from "react-router";

import { BoardProvider } from "@/components/kanban/BoardProvider";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { AccountLoaderData, KanbanLoaderData } from "@/lib/api";

export function KanbanRoute() {
	const { applications, tags } = useLoaderData() as KanbanLoaderData;
	const { user } = useRouteLoaderData("app") as AccountLoaderData;

	return (
		<BoardProvider data={{ user, applications, tags }}>
			<div className="h-full overflow-hidden">
				<KanbanBoard />
				<Outlet />
			</div>
		</BoardProvider>
	);
}
