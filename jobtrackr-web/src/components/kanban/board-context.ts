import {
	createContext,
	type ReactNode,
	type RefObject,
	type SetStateAction,
} from "react";

import type { AppLoaderData } from "@/lib/api";
import type { Application, ApplicationStatus } from "@/types/application";
import type { Tag } from "@/types/tag";
import type { User } from "@/types/user";
import type { BoardPlacement, BoardState } from "./board-state";

export type BoardContextValue = {
	user: User;
	tags: Tag[];
	boardState: BoardState;
	boardStateRef: RefObject<BoardState>;
	applicationsByStatus: Record<ApplicationStatus, Application[]>;
	allApplications: Application[];
	getNextKanbanOrder: (
		applicationStatus: ApplicationStatus,
		applicationId?: number,
	) => number;
	upsertApplication: (
		application: Application,
		placement: BoardPlacement,
	) => void;
	removeApplication: (applicationId: number) => void;
	replaceBoardFromLoader: (applications: Application[]) => void;
	setBoardStateAndRef: (updater: SetStateAction<BoardState>) => void;
};

export type BoardProviderProps = {
	data: AppLoaderData;
	children: ReactNode;
};

export const BoardContext = createContext<BoardContextValue | null>(null);
