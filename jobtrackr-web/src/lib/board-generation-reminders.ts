import {
	isActiveCvGenerationStatus,
	type CvGeneration,
	type CvGenerationStatus,
} from "@/types/cv-generation";

export type BoardGenerationSignifier = "generating" | "success" | "failed";

export type BoardTerminalOutcome = {
	cvGenerationId: number;
	status: "COMPLETED" | "FAILED";
};

/** Minimal per-Application generation info for Kanban card reminders. */
export type BoardGenerationReminder = {
	applicationId: number;
	active: boolean;
	terminalOutcome: BoardTerminalOutcome | null;
};

const terminalActivityAt = (generation: CvGeneration) =>
	generation.completedAt ?? generation.updatedAt;

const isReminderTerminalStatus = (
	status: CvGenerationStatus,
): status is "COMPLETED" | "FAILED" =>
	status === "COMPLETED" || status === "FAILED";

const latestTerminalOutcome = (
	generations: CvGeneration[],
): BoardTerminalOutcome | null => {
	const terminals = generations.filter((generation) =>
		isReminderTerminalStatus(generation.status),
	);
	if (terminals.length === 0) return null;

	const newest = terminals.toSorted((left, right) =>
		terminalActivityAt(right).localeCompare(terminalActivityAt(left)),
	)[0]!;

	const status = newest.status;
	if (!isReminderTerminalStatus(status)) return null;

	return {
		cvGenerationId: newest.cvGenerationId,
		status,
	};
};

export function buildBoardGenerationReminders(
	generations: CvGeneration[],
): BoardGenerationReminder[] {
	const byApplication = new Map<number, CvGeneration[]>();

	for (const generation of generations) {
		const existing = byApplication.get(generation.applicationId);
		if (existing) {
			existing.push(generation);
		} else {
			byApplication.set(generation.applicationId, [generation]);
		}
	}

	return [...byApplication.entries()].map(([applicationId, applicationGenerations]) => ({
		applicationId,
		active: applicationGenerations.some((generation) =>
			isActiveCvGenerationStatus(generation.status),
		),
		terminalOutcome: latestTerminalOutcome(applicationGenerations),
	}));
}

export function resolveBoardGenerationSignifier(
	reminder: BoardGenerationReminder | undefined,
	isTerminalAcknowledged: (cvGenerationId: number) => boolean,
): BoardGenerationSignifier | null {
	if (!reminder) return null;
	if (reminder.active) return "generating";

	const terminal = reminder.terminalOutcome;
	if (!terminal) return null;
	if (isTerminalAcknowledged(terminal.cvGenerationId)) return null;
	if (terminal.status === "COMPLETED") return "success";
	return "failed";
}

export function boardGenerationPath(
	applicationId: number,
	signifier: BoardGenerationSignifier | null,
): string {
	if (signifier) return `/applications/${applicationId}/generate`;
	return `/applications/${applicationId}`;
}
