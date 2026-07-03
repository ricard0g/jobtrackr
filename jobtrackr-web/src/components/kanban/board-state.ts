import { api } from "@/lib/api";
import {
	applicationStatusOptions,
	type Application,
	type ApplicationStatus,
} from "@/types/application";

export type ApplicationsById = Record<number, Application>;
export type KanbanItemsByStatus = Record<ApplicationStatus, number[]>;
export type BoardPlacement =
	| "preserve-position"
	| "server-order"
	| "append-to-status";

export type BoardState = {
	applicationsById: ApplicationsById;
	itemIdsByStatus: KanbanItemsByStatus;
};

export type OrderPatch = {
	applicationId: number;
	applicationKanbanOrder: number;
};

const statusValues = applicationStatusOptions.map((status) => status.value);

export const isApplicationStatus = (
	value: unknown,
): value is ApplicationStatus =>
	typeof value === "string" &&
	statusValues.includes(value as ApplicationStatus);

export const createEmptyItemIdsByStatus = (): KanbanItemsByStatus =>
	applicationStatusOptions.reduce((itemIdsByStatus, status) => {
		itemIdsByStatus[status.value] = [];
		return itemIdsByStatus;
	}, {} as KanbanItemsByStatus);

const compareApplicationsForBoard = (first: Application, second: Application) => {
	const orderDifference =
		first.applicationKanbanOrder - second.applicationKanbanOrder;
	if (orderDifference !== 0) return orderDifference;

	const createdAtDifference =
		new Date(first.applicationCreatedAt).getTime() -
		new Date(second.applicationCreatedAt).getTime();
	if (createdAtDifference !== 0) return createdAtDifference;

	return first.applicationId - second.applicationId;
};

const normalizeBoardState = ({
	applicationsById,
	itemIdsByStatus,
}: BoardState): BoardState => {
	const normalizedApplicationsById = { ...applicationsById };
	const normalizedItemIdsByStatus = createEmptyItemIdsByStatus();

	for (const status of applicationStatusOptions) {
		const seenIds = new Set<number>();
		normalizedItemIdsByStatus[status.value] = itemIdsByStatus[status.value]
			.filter((applicationId) => {
				const application = normalizedApplicationsById[applicationId];
				if (!application || seenIds.has(applicationId)) return false;
				seenIds.add(applicationId);
				return true;
			})
			.map((applicationId, index) => {
				normalizedApplicationsById[applicationId] = {
					...normalizedApplicationsById[applicationId],
					applicationStatus: status.value,
					applicationKanbanOrder: index,
				};
				return applicationId;
			});
	}

	return {
		applicationsById: normalizedApplicationsById,
		itemIdsByStatus: normalizedItemIdsByStatus,
	};
};

export const createBoardState = (applications: Application[]): BoardState => {
	const applicationsById: ApplicationsById = {};
	const itemIdsByStatus = createEmptyItemIdsByStatus();

	const sortedApplications = applications.toSorted(compareApplicationsForBoard);

	for (const application of sortedApplications) {
		applicationsById[application.applicationId] = application;
		itemIdsByStatus[application.applicationStatus].push(
			application.applicationId,
		);
	}

	return normalizeBoardState({ applicationsById, itemIdsByStatus });
};

export const mergeApplicationsIntoBoardState = (
	currentBoardState: BoardState,
	applications: Application[],
): BoardState => {
	const nextApplicationsById = Object.fromEntries(
		applications.map((application) => [
			application.applicationId,
			application,
		]),
	) as ApplicationsById;
	const incomingIds = new Set(applications.map((application) => application.applicationId));
	const preservedIds = new Set<number>();
	const nextItemIdsByStatus = createEmptyItemIdsByStatus();

	for (const status of applicationStatusOptions) {
		for (const applicationId of currentBoardState.itemIdsByStatus[status.value]) {
			const incomingApplication = nextApplicationsById[applicationId];
			const currentApplication =
				currentBoardState.applicationsById[applicationId];

			if (
				incomingApplication &&
				currentApplication &&
				incomingApplication.applicationStatus === currentApplication.applicationStatus
			) {
				nextItemIdsByStatus[status.value].push(applicationId);
				preservedIds.add(applicationId);
			}
		}
	}

	const applicationsNeedingPlacement = applications
		.filter((application) => !preservedIds.has(application.applicationId))
		.toSorted(compareApplicationsForBoard);

	for (const application of applicationsNeedingPlacement) {
		if (!incomingIds.has(application.applicationId)) continue;

		const targetIds = nextItemIdsByStatus[application.applicationStatus];
		const targetIndex = Math.max(
			0,
			Math.min(application.applicationKanbanOrder, targetIds.length),
		);

		targetIds.splice(targetIndex, 0, application.applicationId);
	}

	return normalizeBoardState({
		applicationsById: nextApplicationsById,
		itemIdsByStatus: nextItemIdsByStatus,
	});
};

export const removeApplicationFromBoardState = (
	boardState: BoardState,
	applicationId: number,
): BoardState => {
	const applicationsById = { ...boardState.applicationsById };
	delete applicationsById[applicationId];

	return normalizeBoardState({
		applicationsById,
		itemIdsByStatus: Object.fromEntries(
			applicationStatusOptions.map((status) => [
				status.value,
				boardState.itemIdsByStatus[status.value].filter(
					(id) => id !== applicationId,
				),
			]),
		) as KanbanItemsByStatus,
	});
};

export const upsertApplicationInBoardState = (
	boardState: BoardState,
	updatedApplication: Application,
	placement: BoardPlacement,
): BoardState => {
	const previousStatus = findStatusForApplication(
		boardState.itemIdsByStatus,
		updatedApplication.applicationId,
	);
	const previousIndex = previousStatus
		? boardState.itemIdsByStatus[previousStatus].indexOf(
				updatedApplication.applicationId,
			)
		: -1;
	const boardWithoutApplication = removeApplicationFromBoardState(
		boardState,
		updatedApplication.applicationId,
	);
	const targetIds = [
		...boardWithoutApplication.itemIdsByStatus[
			updatedApplication.applicationStatus
		],
	];
	const sameStatus = previousStatus === updatedApplication.applicationStatus;
	const targetIndex =
		placement === "append-to-status"
			? targetIds.length
			: placement === "preserve-position" && sameStatus && previousIndex >= 0
				? previousIndex
				: updatedApplication.applicationKanbanOrder;

	targetIds.splice(Math.max(0, Math.min(targetIndex, targetIds.length)), 0, updatedApplication.applicationId);

	return normalizeBoardState({
		applicationsById: {
			...boardWithoutApplication.applicationsById,
			[updatedApplication.applicationId]: updatedApplication,
		},
		itemIdsByStatus: {
			...boardWithoutApplication.itemIdsByStatus,
			[updatedApplication.applicationStatus]: targetIds,
		},
	});
};

export const getApplicationsByStatus = (
	{ applicationsById, itemIdsByStatus }: BoardState,
	status: ApplicationStatus,
): Application[] =>
	itemIdsByStatus[status]
		.map((applicationId) => applicationsById[applicationId] ?? null)
		.filter((application): application is Application => application !== null);

export const getAllApplications = (boardState: BoardState): Application[] =>
	applicationStatusOptions.flatMap((status) =>
		getApplicationsByStatus(boardState, status.value),
	);

export const areItemIdsByStatusEqual = (
	first: KanbanItemsByStatus,
	second: KanbanItemsByStatus,
) =>
	applicationStatusOptions.every((status) => {
		const firstIds = first[status.value];
		const secondIds = second[status.value];

		return (
			firstIds.length === secondIds.length &&
			firstIds.every((id, index) => id === secondIds[index])
		);
	});

export const toApplicationId = (value: unknown): number | null => {
	const id = typeof value === "number" ? value : Number(value);
	return Number.isFinite(id) ? id : null;
};

export const findStatusForApplication = (
	itemIdsByStatus: KanbanItemsByStatus,
	applicationId: number,
): ApplicationStatus | null => {
	for (const status of applicationStatusOptions) {
		if (itemIdsByStatus[status.value].includes(applicationId)) {
			return status.value;
		}
	}

	return null;
};

export const syncApplicationsWithItems = (
	boardState: BoardState,
): BoardState => normalizeBoardState(boardState);

const getChangedOrderPatches = (
	previousIds: number[],
	nextIds: number[],
): OrderPatch[] => {
	const previousOrderById = new Map(
		previousIds.map((applicationId, index) => [applicationId, index]),
	);

	return nextIds
		.filter(
			(applicationId, index) =>
				previousOrderById.get(applicationId) !== index,
		)
		.map((applicationId, applicationKanbanOrder) => ({
			applicationId,
			applicationKanbanOrder,
		}));
};

const getChangedStatuses = (
	fromStatus: ApplicationStatus,
	toStatus: ApplicationStatus,
) => (fromStatus === toStatus ? [fromStatus] : [fromStatus, toStatus]);

export const persistKanbanMove = async (
	previousItems: KanbanItemsByStatus,
	nextItems: KanbanItemsByStatus,
	movedApplicationId: number,
	fromStatus: ApplicationStatus,
	toStatus: ApplicationStatus,
) => {
	const changedStatuses = getChangedStatuses(fromStatus, toStatus);
	const orderPatches = changedStatuses.flatMap((status) =>
		getChangedOrderPatches(previousItems[status], nextItems[status]),
	);

	if (fromStatus !== toStatus) {
		await api.setApplicationStatus(movedApplicationId, toStatus);
	}

	await Promise.all(
		orderPatches.map(({ applicationId, applicationKanbanOrder }) =>
			api.patchApplication(applicationId, { applicationKanbanOrder }),
		),
	);
};
