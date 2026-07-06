import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type SetStateAction,
} from "react";

import type { Application, ApplicationStatus } from "@/types/application";
import {
	createBoardState,
	getAllApplications,
	getApplicationsByStatus,
	mergeApplicationsIntoBoardState,
	removeApplicationFromBoardState,
	upsertApplicationInBoardState,
	type BoardPlacement,
	type BoardState,
} from "./board-state";
import {
	BoardContext,
	type BoardProviderProps,
} from "./board-context";

export function BoardProvider({ data, children }: BoardProviderProps) {
	const [boardState, setBoardState] = useState<BoardState>(() =>
		createBoardState(data.applications),
	);
	const boardStateRef = useRef(boardState);

	const setBoardStateAndRef = useCallback(
		(updater: SetStateAction<BoardState>) => {
			setBoardState((currentBoardState) => {
				const nextBoardState =
					typeof updater === "function"
						? (updater as (current: BoardState) => BoardState)(
								currentBoardState,
							)
						: updater;

				boardStateRef.current = nextBoardState;
				return nextBoardState;
			});
		},
		[],
	);

	useEffect(() => {
		boardStateRef.current = boardState;
	}, [boardState]);

	useEffect(() => {
		setBoardStateAndRef((currentBoardState) =>
			mergeApplicationsIntoBoardState(currentBoardState, data.applications),
		);
	}, [data.applications, setBoardStateAndRef]);

	const applicationsByStatus = useMemo(
		() =>
			Object.fromEntries(
				Object.keys(boardState.itemIdsByStatus).map((status) => [
					status,
					getApplicationsByStatus(
						boardState,
						status as ApplicationStatus,
					),
				]),
			) as Record<ApplicationStatus, Application[]>,
		[boardState],
	);
	const allApplications = useMemo(
		() => getAllApplications(boardState),
		[boardState],
	);

	const getNextKanbanOrder = useCallback(
		(applicationStatus: ApplicationStatus, applicationId?: number) =>
			boardStateRef.current.itemIdsByStatus[applicationStatus].filter(
				(id) => id !== applicationId,
			).length,
		[],
	);

	const upsertApplication = useCallback(
		(application: Application, placement: BoardPlacement) => {
			setBoardStateAndRef((currentBoardState) =>
				upsertApplicationInBoardState(
					currentBoardState,
					application,
					placement,
				),
			);
		},
		[setBoardStateAndRef],
	);

	const removeApplication = useCallback(
		(applicationId: number) => {
			setBoardStateAndRef((currentBoardState) =>
				removeApplicationFromBoardState(currentBoardState, applicationId),
			);
		},
		[setBoardStateAndRef],
	);

	const replaceBoardFromLoader = useCallback(
		(applications: Application[]) => {
			setBoardStateAndRef((currentBoardState) =>
				mergeApplicationsIntoBoardState(currentBoardState, applications),
			);
		},
		[setBoardStateAndRef],
	);

	const value = useMemo(
		() => ({
			user: data.user,
			tags: data.tags,
			boardState,
			boardStateRef,
			applicationsByStatus,
			allApplications,
			getNextKanbanOrder,
			upsertApplication,
			removeApplication,
			replaceBoardFromLoader,
			setBoardStateAndRef,
		}),
		[
			data.tags,
			data.user,
			boardState,
			applicationsByStatus,
			allApplications,
			getNextKanbanOrder,
			upsertApplication,
			removeApplication,
			replaceBoardFromLoader,
			setBoardStateAndRef,
		],
	);

	return (
		<BoardContext.Provider value={value}>{children}</BoardContext.Provider>
	);
}
