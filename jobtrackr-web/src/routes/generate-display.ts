import type { Application, RemoteType } from "@/types/application";
import {
	isActiveCvGenerationStatus,
	type CvGeneration,
} from "@/types/cv-generation";
import { latestGeneration } from "@/routes/generate-sections";

const remoteTypeLabels: Record<RemoteType, string> = {
	ON_SITE: "On-site",
	HYBRID: "Hybrid",
	REMOTE: "Remote",
};

export const companyMonogram = (companyName: string): string => {
	const parts = companyName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
};

export const remoteTypeLabel = (type: RemoteType | null): string | null =>
	type ? remoteTypeLabels[type] : null;

export const locationRemoteLabel = (application: Application): string | null => {
	const location = application.applicationLocation?.trim() || null;
	const remote = remoteTypeLabel(application.applicationRemoteType);
	if (location && remote) return `${location} · ${remote}`;
	return location ?? remote;
};

export const humanizeModelId = (modelId: string): string =>
	modelId
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => {
			if (/^\d+(\.\d+)*$/.test(part)) return part;
			return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
		})
		.join(" ");

/** Prefer a readable label for known Gemini drafting ids; leave opaque ids raw. */
export const displayModelName = (modelId: string): string =>
	/^gemini-\d/i.test(modelId) ? humanizeModelId(modelId) : modelId;

export const formatAbsoluteTime = (value: string) =>
	new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
		new Date(value),
	);

export const formatRelativeTime = (value: string, now = new Date()): string => {
	const then = new Date(value).getTime();
	const diffSec = Math.round((then - now.getTime()) / 1000);
	const abs = Math.abs(diffSec);
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	if (abs < 60) return rtf.format(diffSec, "second");
	const diffMin = Math.round(diffSec / 60);
	if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
	const diffHour = Math.round(diffMin / 60);
	if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
	const diffDay = Math.round(diffHour / 24);
	if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
	const diffMonth = Math.round(diffDay / 30);
	if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, "month");
	return rtf.format(Math.round(diffMonth / 12), "year");
};

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

export const shouldStartExpanded = (generations: CvGeneration[]): boolean => {
	if (generations.some((generation) => isActiveCvGenerationStatus(generation.status))) {
		return true;
	}
	return latestGeneration(generations)?.status === "FAILED";
};

export const generationStateLabel = (
	generations: CvGeneration[],
	hasGeneratedCv: boolean,
): string => {
	if (generations.some((generation) => generation.status === "PROCESSING")) {
		return "Generating";
	}
	if (generations.some((generation) => generation.status === "PENDING")) {
		return "Queued";
	}
	const latest = latestGeneration(generations);
	if (!latest) return hasGeneratedCv ? "Completed" : "No CV yet";
	if (latest.status === "FAILED") return "Failed";
	if (latest.status === "CANCELLED") return "Cancelled";
	return "Completed";
};
