import type { Application } from "@/types/application";
import type { ApplicationCv } from "@/types/application-cv";
import { isActiveCvGenerationStatus, type CvGeneration } from "@/types/cv-generation";

export type GenerateSectionItem = {
	application: Application;
	generations: CvGeneration[];
	applicationCvs: ApplicationCv[];
};

export type GenerateSections = {
	preparing: GenerateSectionItem[];
	generated: GenerateSectionItem[];
};

export const latestGeneration = (generations: CvGeneration[]) =>
	generations.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

// Preparing shows processing first, then queued, then latest-failed, then
// untouched/no-document Applications; each category orders by its own most
// relevant activity timestamp, newest first.
const preparingRank = (
	item: GenerateSectionItem,
): { priority: number; activityAt: string } => {
	const latest = latestGeneration(item.generations);
	if (latest?.status === "PROCESSING") {
		return { priority: 0, activityAt: latest.startedAt ?? latest.createdAt };
	}
	if (latest?.status === "PENDING") {
		return { priority: 1, activityAt: latest.createdAt };
	}
	if (latest?.status === "FAILED") {
		return { priority: 2, activityAt: latest.updatedAt };
	}
	return {
		priority: 3,
		activityAt: latest?.updatedAt ?? item.application.applicationUpdatedAt,
	};
};

// Generated orders by document history, so unrelated Application edits do not
// reorder it. Items in this section always have at least one Generated CV.
const newestGeneratedCvAt = (item: GenerateSectionItem) =>
	item.applicationCvs.reduce(
		(newest, applicationCv) =>
			applicationCv.createdAt > newest ? applicationCv.createdAt : newest,
		"",
	);

const byPreparingOrder = (left: GenerateSectionItem, right: GenerateSectionItem) => {
	const leftRank = preparingRank(left);
	const rightRank = preparingRank(right);
	if (leftRank.priority !== rightRank.priority) {
		return leftRank.priority - rightRank.priority;
	}
	return rightRank.activityAt.localeCompare(leftRank.activityAt);
};

export function buildGenerateSections(
	applications: Application[],
	generations: CvGeneration[],
	applicationCvsByApplicationId: Record<number, ApplicationCv[]>,
): GenerateSections {
	const preparing: GenerateSectionItem[] = [];
	const generated: GenerateSectionItem[] = [];

	for (const application of applications) {
		const item: GenerateSectionItem = {
			application,
			generations: generations.filter(
				(generation) => generation.applicationId === application.applicationId,
			),
			applicationCvs: applicationCvsByApplicationId[application.applicationId] ?? [],
		};
		const latest = latestGeneration(item.generations);
		const hasActiveGeneration = latest != null && isActiveCvGenerationStatus(latest.status);
		const latestFailed = latest?.status === "FAILED";
		const hasGeneratedCv = item.applicationCvs.length > 0;
		const closed =
			application.applicationStatus === "REJECTED" ||
			application.applicationStatus === "WITHDRAWN";

		if (closed) {
			// An active generation always takes precedence over closed-application handling.
			if (hasActiveGeneration) {
				preparing.push(item);
			} else if (hasGeneratedCv) {
				generated.push(item);
			}
			// Closed applications without documents or active work are hidden.
			continue;
		}

		if (hasGeneratedCv && !hasActiveGeneration && !latestFailed) {
			generated.push(item);
		} else {
			preparing.push(item);
		}
	}

	preparing.sort(byPreparingOrder);
	generated.sort(
		(left, right) => newestGeneratedCvAt(right).localeCompare(newestGeneratedCvAt(left)),
	);

	return { preparing, generated };
}
