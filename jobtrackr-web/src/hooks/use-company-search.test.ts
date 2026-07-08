import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCompanySearch } from "@/hooks/use-company-search";
import { ApiError, api } from "@/lib/api";
import type { Company } from "@/types/company";

vi.mock("@/lib/api", () => ({
	ApiError: class ApiError extends Error {
		status: number;

		constructor(message: string, status: number) {
			super(message);
			this.name = "ApiError";
			this.status = status;
		}
	},
	api: {
		searchCompanies: vi.fn(),
	},
}));

const mockCompany = (id: number, name: string): Company => ({
	companyId: id,
	userId: null,
	global: true,
	companyName: name,
	companyWebsiteUrl: null,
	companyLocation: null,
	companyType: null,
	companyLogo: null,
	companyCreatedAt: "2026-01-01T00:00:00.000Z",
	companyUpdatedAt: "2026-01-01T00:00:00.000Z",
});

const flushDebounce = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(300);
	});
};

describe("useCompanySearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(api.searchCompanies).mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fetches page 0 when enabled", async () => {
		vi.mocked(api.searchCompanies).mockResolvedValue({
			items: [mockCompany(1, "Google")],
			total: 1,
			page: 0,
			size: 20,
		});

		const { result } = renderHook(() => useCompanySearch({ enabled: true }));

		await flushDebounce();

		expect(api.searchCompanies).toHaveBeenCalledWith(
			expect.objectContaining({
				search: "",
				page: 0,
				size: 20,
			}),
		);
		expect(result.current.companies).toHaveLength(1);
	});

	it("debounces search and only fetches the latest query", async () => {
		vi.mocked(api.searchCompanies).mockResolvedValue({
			items: [],
			total: 0,
			page: 0,
			size: 20,
		});

		const { result } = renderHook(() => useCompanySearch({ enabled: true }));

		await flushDebounce();
		vi.mocked(api.searchCompanies).mockClear();

		act(() => {
			result.current.setSearch("g");
		});
		act(() => {
			result.current.setSearch("go");
		});
		act(() => {
			result.current.setSearch("goo");
		});

		await flushDebounce();

		expect(api.searchCompanies).toHaveBeenCalledTimes(1);
		expect(api.searchCompanies).toHaveBeenCalledWith(
			expect.objectContaining({
				search: "goo",
				page: 0,
				size: 20,
			}),
		);
	});

	it("loadMore requests the next page and merges results", async () => {
		const pageZeroCompanies = Array.from({ length: 20 }, (_, index) =>
			mockCompany(index + 1, `Company ${index + 1}`),
		);
		const pageOneCompanies = [mockCompany(21, "Company 21")];

		vi.mocked(api.searchCompanies)
			.mockResolvedValueOnce({
				items: pageZeroCompanies,
				total: 21,
				page: 0,
				size: 20,
			})
			.mockResolvedValueOnce({
				items: pageOneCompanies,
				total: 21,
				page: 1,
				size: 20,
			});

		const { result } = renderHook(() => useCompanySearch({ enabled: true }));

		await flushDebounce();
		expect(result.current.companies).toHaveLength(20);

		await act(async () => {
			result.current.loadMore();
			await Promise.resolve();
		});

		expect(result.current.companies).toHaveLength(21);

		expect(api.searchCompanies).toHaveBeenLastCalledWith(
			expect.objectContaining({
				search: "",
				page: 1,
				size: 20,
			}),
		);
	});

	it("clears companies immediately when search changes", async () => {
		vi.mocked(api.searchCompanies).mockResolvedValue({
			items: [mockCompany(1, "Google")],
			total: 1,
			page: 0,
			size: 20,
		});

		const { result } = renderHook(() => useCompanySearch({ enabled: true }));

		await flushDebounce();
		expect(result.current.companies).toHaveLength(1);

		act(() => {
			result.current.setSearch("stripe");
		});

		expect(result.current.companies).toHaveLength(0);
		expect(result.current.isDebouncing).toBe(true);
	});

	it("surfaces errors and clears the list on non-append failure", async () => {
		vi.mocked(api.searchCompanies).mockRejectedValue(
			new ApiError("Could not load companies.", 500),
		);

		const { result } = renderHook(() => useCompanySearch({ enabled: true }));

		await flushDebounce();

		expect(result.current.error).toBe("Could not load companies.");
		expect(result.current.companies).toHaveLength(0);
	});

	it("disables loadMore while debouncing", async () => {
		vi.mocked(api.searchCompanies).mockResolvedValue({
			items: Array.from({ length: 20 }, (_, index) =>
				mockCompany(index + 1, `Company ${index + 1}`),
			),
			total: 40,
			page: 0,
			size: 20,
		});

		const { result } = renderHook(() => useCompanySearch({ enabled: true }));

		await flushDebounce();
		expect(result.current.hasMore).toBe(true);

		act(() => {
			result.current.setSearch("a");
		});

		act(() => {
			result.current.loadMore();
		});

		expect(api.searchCompanies).toHaveBeenCalledTimes(1);
	});
});
