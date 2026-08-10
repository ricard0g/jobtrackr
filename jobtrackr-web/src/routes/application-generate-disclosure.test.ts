import { describe, expect, it } from "vitest";

import { getGenerateFormDisclosure } from "@/routes/application-generate-disclosure";

describe("getGenerateFormDisclosure", () => {
	it("expands with Generate CV when idle and there are no Generated CVs", () => {
		expect(
			getGenerateFormDisclosure({
				hasActiveGeneration: false,
				generatedCvCount: 0,
			}),
		).toEqual({
			defaultExpanded: true,
			label: "Generate CV",
			canSubmit: true,
		});
	});

	it("collapses with Generate another when idle and Generated CVs exist", () => {
		expect(
			getGenerateFormDisclosure({
				hasActiveGeneration: false,
				generatedCvCount: 2,
			}),
		).toEqual({
			defaultExpanded: false,
			label: "Generate another",
			canSubmit: true,
		});
	});

	it("collapses and blocks submit while a CV Generation is active", () => {
		expect(
			getGenerateFormDisclosure({
				hasActiveGeneration: true,
				generatedCvCount: 0,
			}),
		).toEqual({
			defaultExpanded: false,
			label: "Generate CV",
			canSubmit: false,
		});

		expect(
			getGenerateFormDisclosure({
				hasActiveGeneration: true,
				generatedCvCount: 1,
			}),
		).toEqual({
			defaultExpanded: false,
			label: "Generate another",
			canSubmit: false,
		});
	});
});
