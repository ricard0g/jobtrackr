import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { kanbanLoader } from "@/routes/app-data";
import type { Application } from "@/types/application";
import type { CvGeneration } from "@/types/cv-generation";
import type { Tag } from "@/types/tag";

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		requireSession: vi.fn(async () => undefined),
		api: {
			...actual.api,
			getApplications: vi.fn(),
			getTags: vi.fn(),
			getCvGenerations: vi.fn(),
		},
	};
});

const application = {
	applicationId: 3,
	applicationTitle: "Backend Engineer",
} as Application;

const tag = { tagId: 1, tagName: "Backend" } as Tag;

const generation = (overrides: Partial<CvGeneration> = {}): CvGeneration =>
	({
		cvGenerationId: 10,
		applicationId: 3,
		status: "PROCESSING",
		createdAt: "2026-07-16T10:00:00.000Z",
		updatedAt: "2026-07-16T10:00:00.000Z",
		completedAt: null,
		...overrides,
	}) as CvGeneration;

describe("kanbanLoader", () => {
	beforeEach(() => {
		vi.mocked(api.getApplications).mockResolvedValue([application]);
		vi.mocked(api.getTags).mockResolvedValue([tag]);
		vi.mocked(api.getCvGenerations).mockResolvedValue([
			generation({ status: "PROCESSING" }),
			generation({
				cvGenerationId: 11,
				applicationId: 9,
				status: "FAILED",
				completedAt: "2026-07-16T11:00:00.000Z",
			}),
		]);
	});

	it("exposes minimal generation reminders for active runs and latest terminals", async () => {
		const data = await kanbanLoader();

		expect(api.getCvGenerations).toHaveBeenCalledWith();
		expect(data.applications).toEqual([application]);
		expect(data.tags).toEqual([tag]);
		expect(data.generationReminders).toEqual([
			{
				applicationId: 3,
				active: true,
				terminalOutcome: null,
			},
			{
				applicationId: 9,
				active: false,
				terminalOutcome: { cvGenerationId: 11, status: "FAILED" },
			},
		]);
	});
});
