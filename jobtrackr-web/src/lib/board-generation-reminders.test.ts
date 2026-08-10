import { describe, expect, it } from "vitest";

import type { CvGeneration } from "@/types/cv-generation";
import {
	boardGenerationPath,
	buildBoardGenerationReminders,
	resolveBoardGenerationSignifier,
	type BoardGenerationReminder,
} from "@/lib/board-generation-reminders";

const generation = (overrides: Partial<CvGeneration> = {}): CvGeneration => ({
	cvGenerationId: 10,
	applicationId: 3,
	baseCvId: 1,
	requestedFormat: "DOCX",
	status: "COMPLETED",
	idempotencyKey: "idem-10",
	correlationId: "corr-10",
	errorCode: null,
	errorMessage: null,
	generatedCvId: 5,
	modelId: null,
	workflowVersion: null,
	createdAt: "2026-07-16T10:00:00.000Z",
	updatedAt: "2026-07-16T10:00:00.000Z",
	startedAt: null,
	completedAt: "2026-07-16T10:05:00.000Z",
	statusUrl: "/api/v1/cv-generations/10",
	...overrides,
});

describe("buildBoardGenerationReminders", () => {
	it("exposes active runs and latest COMPLETED/FAILED terminals per Application", () => {
		expect(
			buildBoardGenerationReminders([
				generation({
					cvGenerationId: 1,
					applicationId: 3,
					status: "CANCELLED",
					completedAt: "2026-07-16T09:00:00.000Z",
				}),
				generation({
					cvGenerationId: 2,
					applicationId: 3,
					status: "COMPLETED",
					completedAt: "2026-07-16T11:00:00.000Z",
				}),
				generation({
					cvGenerationId: 3,
					applicationId: 3,
					status: "PROCESSING",
					completedAt: null,
				}),
				generation({
					cvGenerationId: 4,
					applicationId: 9,
					status: "FAILED",
					completedAt: "2026-07-16T12:00:00.000Z",
				}),
			]),
		).toEqual([
			{
				applicationId: 3,
				active: true,
				terminalOutcome: { cvGenerationId: 2, status: "COMPLETED" },
			},
			{
				applicationId: 9,
				active: false,
				terminalOutcome: { cvGenerationId: 4, status: "FAILED" },
			},
		]);
	});

	it("ignores CANCELLED as a reminder terminal outcome", () => {
		expect(
			buildBoardGenerationReminders([
				generation({
					cvGenerationId: 8,
					status: "CANCELLED",
					completedAt: "2026-07-16T13:00:00.000Z",
				}),
			]),
		).toEqual([
			{
				applicationId: 3,
				active: false,
				terminalOutcome: null,
			},
		]);
	});
});

describe("resolveBoardGenerationSignifier", () => {
	const reminder = (
		overrides: Partial<BoardGenerationReminder> = {},
	): BoardGenerationReminder => ({
		applicationId: 3,
		active: false,
		terminalOutcome: { cvGenerationId: 10, status: "COMPLETED" },
		...overrides,
	});

	it("prefers generating over an unacknowledged terminal outcome", () => {
		expect(
			resolveBoardGenerationSignifier(reminder({ active: true }), () => false),
		).toBe("generating");
	});

	it("shows success for unacknowledged COMPLETED", () => {
		expect(resolveBoardGenerationSignifier(reminder(), () => false)).toBe("success");
	});

	it("shows failed for unacknowledged FAILED", () => {
		expect(
			resolveBoardGenerationSignifier(
				reminder({ terminalOutcome: { cvGenerationId: 10, status: "FAILED" } }),
				() => false,
			),
		).toBe("failed");
	});

	it("hides success/failed after the terminal CV Generation is acknowledged", () => {
		expect(
			resolveBoardGenerationSignifier(reminder(), (id) => id === 10),
		).toBeNull();
	});

	it("shows a later terminal outcome after a previous one was acknowledged", () => {
		expect(
			resolveBoardGenerationSignifier(
				reminder({ terminalOutcome: { cvGenerationId: 22, status: "COMPLETED" } }),
				(id) => id === 10,
			),
		).toBe("success");
	});
});

describe("boardGenerationPath", () => {
	it("opens Generate when a signifier is present and Details otherwise", () => {
		expect(boardGenerationPath(3, "generating")).toBe("/applications/3/generate");
		expect(boardGenerationPath(3, "success")).toBe("/applications/3/generate");
		expect(boardGenerationPath(3, "failed")).toBe("/applications/3/generate");
		expect(boardGenerationPath(3, null)).toBe("/applications/3");
	});
});
