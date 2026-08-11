import { useEffect } from "react";
import { Outlet, useLoaderData, useRevalidator, useRouteLoaderData } from "react-router";

import { BoardGenerationRemindersProvider } from "@/components/kanban/BoardGenerationRemindersProvider";
import { BoardProvider } from "@/components/kanban/BoardProvider";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { AccountLoaderData, KanbanLoaderData } from "@/lib/api";

const BOARD_GENERATION_POLL_INTERVAL_MS = 3_000;

export function KanbanRoute() {
	const { applications, tags, generationReminders } =
		useLoaderData() as KanbanLoaderData;
	const { user } = useRouteLoaderData("app") as AccountLoaderData;
	const revalidator = useRevalidator();
	const hasAnyActiveGeneration = generationReminders.some(
		(reminder) => reminder.active,
	);

	useEffect(() => {
		if (!hasAnyActiveGeneration) return;
		const intervalId = window.setInterval(() => {
			if (revalidator.state === "idle") {
				void revalidator.revalidate();
			}
		}, BOARD_GENERATION_POLL_INTERVAL_MS);
		return () => window.clearInterval(intervalId);
	}, [hasAnyActiveGeneration, revalidator]);

	return (
		<BoardGenerationRemindersProvider reminders={generationReminders}>
			<BoardProvider data={{ user, applications, tags }}>
				<div className="h-full overflow-hidden">
					<KanbanBoard />
					<Outlet />
				</div>
			</BoardProvider>
		</BoardGenerationRemindersProvider>
	);
}
