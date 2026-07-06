import { describe, expect, it } from "vitest";

import { getAccessibleCompanies } from "@/mocks/db";
import { createSeedState } from "@/mocks/seed";

const demoUserId = "11111111-1111-4111-8111-111111111111";

describe("mock company seed", () => {
	it("exposes more than one page of companies for pagination testing", () => {
		const companies = getAccessibleCompanies(createSeedState(), demoUserId);
		const pageSize = 20;

		expect(companies.length).toBeGreaterThan(pageSize);

		const page0 = companies.slice(0, pageSize);
		const page1 = companies.slice(pageSize, pageSize * 2);

		expect(page0).toHaveLength(pageSize);
		expect(page1.length).toBeGreaterThan(0);
	});
});
