import type { Application } from "@/types/application";
import type { GeneratedCv } from "@/types/generated-cv";
import { isActiveCvGenerationStatus, type CvGeneration } from "@/types/cv-generation";

export type GenerateSectionItem = {
	application: Application;
	generations: CvGeneration[];
	generatedCvs: GeneratedCv[];
};

export type GenerateSections = {
	preparing: GenerateSectionItem[];
	generated: GenerateSectionItem[];
};

export const latestGeneration = (generations: CvGeneration[]) =>
	generations.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

const newestAmong = (
	generations: CvGeneration[],
	activityAt: (generation: CvGeneration) => string,
) =>
	generations.toSorted((left, right) =>
		activityAt(right).localeCompare(activityAt(left)),
	)[0]!;

// Preparing shows processing first, then queued, then latest-failed, then
// untouched/no-document Applications; each category orders by its own most
// relevant activity timestamp, newest first. Any in-flight generation counts,
// not only the chronologically latest attempt.
const preparingRank = (
	item: GenerateSectionItem,
): { priority: number; activityAt: string } => {
	const processing = item.generations.filter(
		(generation) => generation.status === "PROCESSING",
	);
	if (processing.length > 0) {
		const generation = newestAmong(
			processing,
			(candidate) => candidate.startedAt ?? candidate.createdAt,
		);
		return { priority: 0, activityAt: generation.startedAt ?? generation.createdAt };
	}
	const pending = item.generations.filter((generation) => generation.status === "PENDING");
	if (pending.length > 0) {
		const generation = newestAmong(pending, (candidate) => candidate.createdAt);
		return { priority: 1, activityAt: generation.createdAt };
	}
	const latest = latestGeneration(item.generations);
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
	item.generatedCvs.reduce(
		(newest, generatedCv) =>
			generatedCv.createdAt > newest ? generatedCv.createdAt : newest,
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

export const preparingActivityAt = (
	application: Application,
	generations: CvGeneration[],
): string =>
	preparingRank({ application, generations, generatedCvs: [] }).activityAt;

export const newestGeneratedCv = (generatedCvs: GeneratedCv[]) =>
	generatedCvs.reduce<GeneratedCv | null>((newest, generatedCv) => {
		if (!newest || generatedCv.createdAt > newest.createdAt) return generatedCv;
		return newest;
	}, null);

export const generatedActivityAt = (generatedCvs: GeneratedCv[]): string =>
	newestGeneratedCv(generatedCvs)?.createdAt ?? "";

export function buildGenerateSections(
	applications: Application[],
	generations: CvGeneration[],
	generatedCvsByApplicationId: Record<number, GeneratedCv[]>,
): GenerateSections {
	const preparing: GenerateSectionItem[] = [];
	const generated: GenerateSectionItem[] = [];

	for (const application of applications) {
		const item: GenerateSectionItem = {
			application,
			generations: generations.filter(
				(generation) => generation.applicationId === application.applicationId,
			),
			generatedCvs: generatedCvsByApplicationId[application.applicationId] ?? [],
		};
		const latest = latestGeneration(item.generations);
		const hasActiveGeneration = item.generations.some((generation) =>
			isActiveCvGenerationStatus(generation.status),
		);
		const latestFailed = latest?.status === "FAILED";
		const hasGeneratedCv = item.generatedCvs.length > 0;
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
