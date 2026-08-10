import type { CvGeneration } from "@/types/cv-generation";

export const formatAbsoluteTime = (value: string) =>
	new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
		new Date(value),
	);

export const formatElapsedDuration = (fromIso: string, now = new Date()): string => {
	const elapsedSec = Math.max(
		0,
		Math.floor((now.getTime() - new Date(fromIso).getTime()) / 1000),
	);
	const hours = Math.floor(elapsedSec / 3600);
	const minutes = Math.floor((elapsedSec % 3600) / 60);
	const seconds = elapsedSec % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
};

export const activeElapsedStartedAt = (generation: CvGeneration): string =>
	generation.status === "PENDING"
		? generation.createdAt
		: (generation.startedAt ?? generation.createdAt);
