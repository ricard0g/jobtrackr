import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyCombobox } from "./CompanyCombobox";
import { useCompanySearch } from "@/hooks/use-company-search";
import { ApiError, api } from "@/lib/api";
import type { Company } from "@/types/company";

vi.mock("@/hooks/use-company-search", () => ({
	useCompanySearch: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

	return {
		...actual,
		api: {
			...actual.api,
			createCompany: vi.fn(),
		},
	};
});

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

type SearchHookState = {
	initialSearch: string;
	companies: Company[];
	isLoading: boolean;
	isLoadingMore: boolean;
	isDebouncing: boolean;
	hasMore: boolean;
	error: string | null;
};

const searchHookState: SearchHookState = {
	initialSearch: "",
	companies: [],
	isLoading: false,
	isLoadingMore: false,
	isDebouncing: false,
	hasMore: false,
	error: null,
};

const loadMore = vi.fn();
const reset = vi.fn();

beforeAll(() => {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}

	Object.defineProperty(globalThis, "ResizeObserver", {
		value: ResizeObserverMock,
		configurable: true,
	});
	Object.defineProperties(HTMLElement.prototype, {
		hasPointerCapture: {
			value: () => false,
			configurable: true,
		},
		setPointerCapture: {
			value: () => undefined,
			configurable: true,
		},
		releasePointerCapture: {
			value: () => undefined,
			configurable: true,
		},
		scrollIntoView: {
			value: () => undefined,
			configurable: true,
		},
	});
});

beforeEach(() => {
	searchHookState.initialSearch = "";
	searchHookState.companies = [];
	searchHookState.isLoading = false;
	searchHookState.isLoadingMore = false;
	searchHookState.isDebouncing = false;
	searchHookState.hasMore = false;
	searchHookState.error = null;
	loadMore.mockReset();
	reset.mockReset();
	vi.mocked(api.createCompany).mockReset();

	vi.mocked(useCompanySearch).mockImplementation(() => {
		const [search, setSearch] = useState(searchHookState.initialSearch);

		return {
			search,
			setSearch,
			companies: searchHookState.companies,
			isLoading: searchHookState.isLoading,
			isLoadingMore: searchHookState.isLoadingMore,
			isDebouncing: searchHookState.isDebouncing,
			hasMore: searchHookState.hasMore,
			error: searchHookState.error,
			loadMore,
			reset,
		};
	});
});

type HarnessProps = {
	onChange?: (companyId: string, company: Company) => void;
};

function Harness({ onChange = () => undefined }: HarnessProps) {
	const [value, setValue] = useState("");
	const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

	return (
		<CompanyCombobox
			value={value}
			selectedCompany={selectedCompany}
			onChange={(companyId, company) => {
				setValue(companyId);
				setSelectedCompany(company);
				onChange(companyId, company);
			}}
		/>
	);
}

const openCombobox = () => fireEvent.click(screen.getByRole("combobox"));

const createButton = (name: string) =>
	screen.queryByRole("button", { name: `Create "${name}"` });

describe("CompanyCombobox", () => {
	it("hides the create button when matching companies exist", () => {
		searchHookState.initialSearch = "Goo";
		searchHookState.companies = [mockCompany(1, "Google")];

		render(<Harness />);
		openCombobox();

		expect(screen.getByText("Google")).toBeTruthy();
		expect(createButton("Goo")).toBeNull();
	});

	it("hides the create button when the search query is blank", () => {
		render(<Harness />);
		openCombobox();

		expect(screen.getByText("No companies found.")).toBeTruthy();
		expect(createButton("")).toBeNull();
		expect(screen.queryByRole("button", { name: /Create "/ })).toBeNull();
	});

	it("hides the create button while search is pending", () => {
		searchHookState.initialSearch = "Acme Labs";
		searchHookState.isLoading = true;

		render(<Harness />);
		openCombobox();

		expect(screen.getByText("Loading companies...")).toBeTruthy();
		expect(createButton("Acme Labs")).toBeNull();
	});

	it("hides the create button when company search fails", () => {
		searchHookState.initialSearch = "Acme Labs";
		searchHookState.error = "Could not load companies.";

		render(<Harness />);
		openCombobox();

		expect(screen.getByText("Could not load companies.")).toBeTruthy();
		expect(createButton("Acme Labs")).toBeNull();
	});

	it("shows a create button when there are no matching companies", () => {
		searchHookState.initialSearch = "Acme Labs";

		render(<Harness />);
		openCombobox();

		expect(screen.getByText("No companies found.")).toBeTruthy();
		expect(createButton("Acme Labs")).toBeTruthy();
	});

	it("creates the company and selects it", async () => {
		const onChange = vi.fn();
		const createdCompany = {
			...mockCompany(42, "Acme Labs"),
			userId: "user-1",
			global: false,
		};
		searchHookState.initialSearch = "Acme Labs";
		vi.mocked(api.createCompany).mockResolvedValue(createdCompany);

		render(<Harness onChange={onChange} />);
		openCombobox();
		fireEvent.click(screen.getByRole("button", { name: 'Create "Acme Labs"' }));

		await waitFor(() => {
			expect(api.createCompany).toHaveBeenCalledWith({ companyName: "Acme Labs" });
			expect(onChange).toHaveBeenCalledWith("42", createdCompany);
		});
		expect(screen.getByRole("combobox").textContent).toContain("Acme Labs");
		expect(reset).toHaveBeenCalled();
	});

	it("shows a duplicate-name error and keeps the popover open", async () => {
		const onChange = vi.fn();
		searchHookState.initialSearch = "Acme Labs";
		vi.mocked(api.createCompany).mockRejectedValue(
			new ApiError(
				"Company name already exists",
				409,
				"DUPLICATE_COMPANY_NAME",
			),
		);

		render(<Harness onChange={onChange} />);
		openCombobox();
		fireEvent.click(screen.getByRole("button", { name: 'Create "Acme Labs"' }));

		expect(
			await screen.findByRole("alert"),
		).toHaveProperty("textContent", "A company with this name already exists.");
		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: 'Create "Acme Labs"' })).toBeTruthy();
	});

	it("does not submit create again while a request is pending", async () => {
		searchHookState.initialSearch = "Acme Labs";
		let resolveCreate: ((company: Company) => void) | undefined;
		vi.mocked(api.createCompany).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCreate = resolve;
				}),
		);

		render(<Harness />);
		openCombobox();

		const button = screen.getByRole("button", { name: 'Create "Acme Labs"' });
		fireEvent.click(button);
		fireEvent.click(button);

		expect(api.createCompany).toHaveBeenCalledTimes(1);
		expect(button).toHaveProperty("disabled", true);

		resolveCreate?.({
			...mockCompany(42, "Acme Labs"),
			userId: "user-1",
			global: false,
		});

		await waitFor(() => {
			expect(screen.getByRole("combobox").textContent).toContain("Acme Labs");
		});
	});
});
