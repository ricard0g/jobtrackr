import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useRef, useState } from "react";
import { useLoaderData } from "react-router";

import { PostulationDetailDrawer } from "@/components/postulations/PostulationDetailDrawer";
import { api } from "@/lib/api";
import type { AppLoaderData } from "@/lib/api";
import {
	applicationStatusOptions,
	type Application,
	type ApplicationStatus,
} from "@/types/application";
import type { Company } from "@/types/company";
import { StatusColumn } from "./StatusColumn";

type ApplicationsByStatus = Record<ApplicationStatus, Application[]>;
type OrderPatch = {
	applicationId: number;
	applicationKanbanOrder: number;
};

const statusValues = applicationStatusOptions.map((status) => status.value);

const isApplicationStatus = (value: unknown): value is ApplicationStatus =>
	typeof value === "string" &&
	statusValues.includes(value as ApplicationStatus);

const groupApplicationsByStatus = (
	applications: Application[],
): ApplicationsByStatus => {
	return Object.fromEntries(
		applicationStatusOptions.map((status) => [
			status.value,
			applications
				.filter(
					(application) =>
						application.applicationStatus === status.value,
				)
				.toSorted(
					(a, b) =>
						a.applicationKanbanOrder - b.applicationKanbanOrder,
				),
		]),
	) as ApplicationsByStatus;
};

const normalizeKanbanOrder = (
	applicationsByStatus: ApplicationsByStatus,
	statuses: ApplicationStatus[],
): ApplicationsByStatus => {
	return {
		...applicationsByStatus,
		...Object.fromEntries(
			statuses.map((status) => [
				status,
				applicationsByStatus[status].map((application, index) => ({
					...application,
					applicationStatus: status,
					applicationKanbanOrder: index,
				})),
			]),
		),
	};
};

const removeApplicationById = (
	applicationsByStatus: ApplicationsByStatus,
	applicationId: number,
): ApplicationsByStatus =>
	Object.fromEntries(
		applicationStatusOptions.map((status) => [
			status.value,
			applicationsByStatus[status.value].filter(
				(application) => application.applicationId !== applicationId,
			),
		]),
	) as ApplicationsByStatus;

const replaceApplication = (
	applicationsByStatus: ApplicationsByStatus,
	updatedApplication: Application,
): ApplicationsByStatus => {
	const withoutApplication = removeApplicationById(
		applicationsByStatus,
		updatedApplication.applicationId,
	);
	const targetApplications = [
		...withoutApplication[updatedApplication.applicationStatus],
	];
	const targetIndex = Math.max(
		0,
		Math.min(
			updatedApplication.applicationKanbanOrder,
			targetApplications.length,
		),
	);

	targetApplications.splice(targetIndex, 0, updatedApplication);

	return {
		...withoutApplication,
		[updatedApplication.applicationStatus]: targetApplications,
	};
};

const moveApplication = (
	applicationsByStatus: ApplicationsByStatus,
	fromStatus: ApplicationStatus,
	fromIndex: number,
	toStatus: ApplicationStatus,
	toIndex: number,
): ApplicationsByStatus => {
	const sourceApplications = [...applicationsByStatus[fromStatus]];
	const [movedApplication] = sourceApplications.splice(fromIndex, 1);

	if (!movedApplication) return applicationsByStatus;

	const targetApplications =
		fromStatus === toStatus
			? sourceApplications
			: [...applicationsByStatus[toStatus]];
	const adjustedTargetIndex =
		fromStatus === toStatus && fromIndex < toIndex ? toIndex - 1 : toIndex;
	const boundedTargetIndex = Math.max(
		0,
		Math.min(adjustedTargetIndex, targetApplications.length),
	);

	targetApplications.splice(boundedTargetIndex, 0, movedApplication);

	return normalizeKanbanOrder(
		{
			...applicationsByStatus,
			[fromStatus]: sourceApplications,
			[toStatus]: targetApplications,
		},
		fromStatus === toStatus ? [fromStatus] : [fromStatus, toStatus],
	);
};

const getChangedOrderPatches = (
	previousApplications: Application[],
	nextApplications: Application[],
): OrderPatch[] => {
	const previousOrderById = new Map(
		previousApplications.map((application) => [
			application.applicationId,
			application.applicationKanbanOrder,
		]),
	);

	return nextApplications
		.filter(
			(application) =>
				previousOrderById.get(application.applicationId) !==
				application.applicationKanbanOrder,
		)
		.map(({ applicationId, applicationKanbanOrder }) => ({
			applicationId,
			applicationKanbanOrder,
		}));
};

const persistKanbanMove = async (
	previousApplications: ApplicationsByStatus,
	nextApplications: ApplicationsByStatus,
	movedApplicationId: number,
	fromStatus: ApplicationStatus,
	toStatus: ApplicationStatus,
) => {
	const orderPatches =
		fromStatus === toStatus
			? getChangedOrderPatches(
					previousApplications[fromStatus],
					nextApplications[fromStatus],
				)
			: [
					...getChangedOrderPatches(
						previousApplications[fromStatus],
						nextApplications[fromStatus],
					),
					...getChangedOrderPatches(
						previousApplications[toStatus],
						nextApplications[toStatus],
					),
				];

	if (fromStatus !== toStatus) {
		await api.setApplicationStatus(movedApplicationId, toStatus);
	}

	await Promise.all(
		orderPatches.map(({ applicationId, applicationKanbanOrder }) =>
			api.patchApplication(applicationId, { applicationKanbanOrder }),
		),
	);
};

export function KanbanBoard() {
	const { applications, companies } = useLoaderData() as AppLoaderData;
	const boardKey = applications
		.map(
			(application) =>
				`${application.applicationId}:${application.applicationStatus}:${application.applicationKanbanOrder}:${application.applicationUpdatedAt}`,
		)
		.join("|");

	return (
		<KanbanBoardContent
			key={boardKey}
			applications={applications}
			companies={companies}
		/>
	);
}

function KanbanBoardContent({
	applications,
	companies,
}: {
	applications: Application[];
	companies: Company[];
}) {
	const [applicationsState, setApplicationsState] =
		useState<ApplicationsByStatus>(() =>
			groupApplicationsByStatus(applications),
		);
	const [selectedApplication, setSelectedApplication] =
		useState<Application | null>(null);
	const persistenceVersionRef = useRef(0);

	const getNextKanbanOrder = (
		applicationStatus: ApplicationStatus,
		applicationId: number,
	) =>
		applicationsState[applicationStatus].filter(
			(application) => application.applicationId !== applicationId,
		).length;

	const handleApplicationUpdated = (updatedApplication: Application) => {
		setApplicationsState((currentApplications) =>
			replaceApplication(currentApplications, updatedApplication),
		);
		setSelectedApplication(updatedApplication);
	};

	const handleApplicationDeleted = (applicationId: number) => {
		setApplicationsState((currentApplications) =>
			removeApplicationById(currentApplications, applicationId),
		);
		setSelectedApplication(null);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		if (event.canceled) return;

		const { source, target } = event.operation;

		if (!isSortable(source) || source.type !== "item" || !target) return;

		const fromStatus = source.initialGroup;
		const fromIndex = source.initialIndex;
		const movedApplicationId =
			typeof source.id === "number" ? source.id : Number(source.id);

		if (!isApplicationStatus(fromStatus) || Number.isNaN(movedApplicationId)) {
			return;
		}

		let toStatus: ApplicationStatus | undefined;
		let toIndex: number | undefined;

		if (target.type === "column") {
			if (!isApplicationStatus(target.id)) return;
			toStatus = target.id;
			toIndex = applicationsState[toStatus].length;
		} else if (isSortable(target)) {
			if (!isApplicationStatus(target.group)) return;

			const activeCenter =
				event.operation.shape?.current.center ??
				event.operation.position.current;
			const targetShape = target.shape;
			const isBelowTarget = targetShape
				? Math.round(activeCenter.y) > Math.round(targetShape.center.y)
				: false;

			toStatus = target.group;
			toIndex = target.index + (isBelowTarget ? 1 : 0);
		}

		if (!toStatus || toIndex === undefined) return;
		if (fromStatus === toStatus && fromIndex === toIndex) return;

		const previousApplications = applicationsState;
		const nextApplications = moveApplication(
			previousApplications,
			fromStatus,
			fromIndex,
			toStatus,
			toIndex,
		);
		const persistenceVersion = persistenceVersionRef.current + 1;
		persistenceVersionRef.current = persistenceVersion;

		setApplicationsState(nextApplications);

		void persistKanbanMove(
			previousApplications,
			nextApplications,
			movedApplicationId,
			fromStatus,
			toStatus,
		).catch(() => {
			if (persistenceVersionRef.current === persistenceVersion) {
				setApplicationsState(previousApplications);
			}
		});
	};

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<div className="grid grid-flow-col-dense max-w-full gap-x-4 overflow-x-scroll px-8 py-8">
				{applicationStatusOptions.map((status) => (
					<StatusColumn
						key={status.value}
						status={status}
						applications={applicationsState[status.value]}
						companies={companies}
						allApplications={applications}
						onOpenDetails={setSelectedApplication}
					/>
				))}
			</div>
			<PostulationDetailDrawer
				open={selectedApplication !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedApplication(null);
				}}
				application={selectedApplication}
				getNextKanbanOrder={getNextKanbanOrder}
				onApplicationUpdated={handleApplicationUpdated}
				onApplicationDeleted={handleApplicationDeleted}
			/>
		</DragDropProvider>
	);
}
