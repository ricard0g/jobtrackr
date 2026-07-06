import {
	DragDropProvider,
	type DragEndEvent,
	type DragOverEvent,
} from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { isSortable } from "@dnd-kit/react/sortable";
import { useCallback, useRef } from "react";

import { applicationStatusOptions } from "@/types/application";
import {
	areItemIdsByStatusEqual,
	findStatusForApplication,
	isApplicationStatus,
	persistKanbanMove,
	syncApplicationsWithItems,
	toApplicationId,
	type BoardState,
} from "./board-state";
import { useBoard } from "./useBoard";
import { StatusColumn } from "./StatusColumn";

export function KanbanBoard() {
	const {
		applicationsByStatus,
		allApplications,
		boardStateRef,
		setBoardStateAndRef,
	} = useBoard();
	const snapshotRef = useRef<BoardState | null>(null);
	const persistenceVersionRef = useRef(0);

	const handleDragStart = useCallback(() => {
		snapshotRef.current = boardStateRef.current;
	}, [boardStateRef]);

	const handleDragOver = useCallback(
		(event: DragOverEvent) => {
			const { source } = event.operation;

			if (!isSortable(source) || source.type !== "item") return;

			setBoardStateAndRef((currentBoardState) => {
				const nextItemIdsByStatus = move(
					currentBoardState.itemIdsByStatus,
					event,
				);

				if (
					areItemIdsByStatusEqual(
						currentBoardState.itemIdsByStatus,
						nextItemIdsByStatus,
					)
				) {
					return currentBoardState;
				}

				return syncApplicationsWithItems({
					...currentBoardState,
					itemIdsByStatus: nextItemIdsByStatus,
				});
			});
		},
		[setBoardStateAndRef],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { source } = event.operation;

			if (!isSortable(source) || source.type !== "item") return;

			if (event.canceled) {
				if (snapshotRef.current) {
					setBoardStateAndRef(snapshotRef.current);
				}
				return;
			}

			const movedApplicationId = toApplicationId(source.id);

			if (movedApplicationId === null) return;

			const previousBoardState = snapshotRef.current ?? boardStateRef.current;
			const fromStatus = findStatusForApplication(
				previousBoardState.itemIdsByStatus,
				movedApplicationId,
			);

			if (!fromStatus) return;

			const currentBoardState = boardStateRef.current;
			const nextItemIdsByStatus = move(currentBoardState.itemIdsByStatus, event);
			const finalBoardState = syncApplicationsWithItems({
				...currentBoardState,
				itemIdsByStatus: nextItemIdsByStatus,
			});
			const sourceGroup = isApplicationStatus(source.group)
				? source.group
				: null;
			const toStatus =
				findStatusForApplication(
					finalBoardState.itemIdsByStatus,
					movedApplicationId,
				) ?? sourceGroup;

			if (!toStatus) return;

			if (
				areItemIdsByStatusEqual(
					previousBoardState.itemIdsByStatus,
					finalBoardState.itemIdsByStatus,
				)
			) {
				setBoardStateAndRef(finalBoardState);
				return;
			}

			const persistenceVersion = persistenceVersionRef.current + 1;
			persistenceVersionRef.current = persistenceVersion;
			setBoardStateAndRef(finalBoardState);

			void persistKanbanMove(
				previousBoardState.itemIdsByStatus,
				finalBoardState.itemIdsByStatus,
				movedApplicationId,
				fromStatus,
				toStatus,
			).catch(() => {
				if (persistenceVersionRef.current === persistenceVersion) {
					setBoardStateAndRef(previousBoardState);
				}
			});
		},
		[boardStateRef, setBoardStateAndRef],
	);

	return (
		<DragDropProvider
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className="flex gap-x-4 overflow-x-scroll px-8 py-8">
				{applicationStatusOptions.map((status) => (
					<StatusColumn
						key={status.value}
						status={status}
						applications={applicationsByStatus[status.value]}
						allApplications={allApplications}
					/>
				))}
			</div>
		</DragDropProvider>
	);
}
