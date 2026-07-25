import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { api } from "@/lib/api";
import { DocumentsRoute } from "@/routes/DocumentsRoute";
import type { DocumentsLoaderData } from "@/routes/documents-data";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCvSummary } from "@/types/generated-cv";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const baseCv = (overrides: Partial<BaseCv> = {}): BaseCv => ({
	baseCvId: 1,
	originalFilename: "engineering-profile.pdf",
	format: "PDF",
	contentType: "application/pdf",
	byteSize: 1_572_864,
	createdAt: "2026-07-16T12:00:00Z",
	...overrides,
});

const generatedCv = (overrides: Partial<GeneratedCvSummary> = {}): GeneratedCvSummary => ({
	generatedCvId: 101,
	applicationId: 3,
	applicationTitle: "Backend Engineer",
	companyName: "Acme",
	version: 2,
	originalFilename: "acme-backend-v2.pdf",
	format: "PDF",
	contentType: "application/pdf",
	byteSize: 2048,
	generationId: 11,
	createdAt: "2026-07-18T10:00:00Z",
	...overrides,
});

const renderDocuments = (
	data: Partial<DocumentsLoaderData> = {},
	action?: () => Promise<unknown>,
) => {
	const loaderData: DocumentsLoaderData = {
		baseCvs: [],
		generatedCvs: [],
		generatedCvsPage: 0,
		generatedCvsTotal: 0,
		generatedCvsError: null,
		...data,
	};
	const router = createMemoryRouter(
		[
			{
				path: "/documents",
				Component: DocumentsRoute,
				loader: () => loaderData,
				action,
			},
			{ path: "/generate", element: <div>Generate route</div> },
		],
		{ initialEntries: ["/documents"] },
	);
	render(<RouterProvider router={router} />);
	return router;
};

describe("DocumentsRoute", () => {
	it("shows the upload guidance and empty state", async () => {
		renderDocuments();

		expect(await screen.findByRole("heading", { name: "Documents" })).toBeTruthy();
		expect(screen.getByText("No Base CVs yet")).toBeTruthy();
		expect(screen.getByText("PDF, DOCX, or Markdown · 10 MB maximum")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Upload a Base CV" }).getAttribute("tabindex")).toBe(
			"0",
		);
		expect(screen.getByRole("heading", { name: "Generated CVs" })).toBeTruthy();
		expect(screen.getByText("No Generated CVs yet")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Generate" })).toBeTruthy();
	});

	it("renders document metadata and accessible actions", async () => {
		renderDocuments({ baseCvs: [baseCv()] });

		expect(await screen.findByText("engineering-profile.pdf")).toBeTruthy();
		expect(screen.getByText(/PDF · 1.5 MB/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download engineering-profile.pdf" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete engineering-profile.pdf" })).toBeTruthy();
	});

	it("disables upload controls when the quota is full", async () => {
		const documents = Array.from({ length: 20 }, (_, index): BaseCv =>
			baseCv({
				baseCvId: index + 1,
				originalFilename: `cv-${index + 1}.md`,
				format: "MARKDOWN",
				contentType: "text/markdown",
				byteSize: 1024,
			}),
		);
		renderDocuments({
			baseCvs: documents,
			generatedCvs: Array.from({ length: 5 }, (_, index) =>
				generatedCv({ generatedCvId: index + 1 }),
			),
			generatedCvsTotal: 5,
		});

		const upload = await screen.findByRole("button", { name: "Upload a Base CV" });
		expect(upload.getAttribute("aria-disabled")).toBe("true");
		expect(screen.getByText("Delete a Base CV to make room for another upload.")).toBeTruthy();
		expect(screen.getByText("20 / 20")).toBeTruthy();
	});

	it("shows Generated CV metadata, recessed section, and row actions", async () => {
		renderDocuments({
			baseCvs: [baseCv()],
			generatedCvs: [generatedCv()],
			generatedCvsTotal: 1,
		});

		expect(await screen.findByText("acme-backend-v2.pdf")).toBeTruthy();
		expect(screen.getByText(/Backend Engineer · Acme/)).toBeTruthy();
		expect(screen.getByText(/v2 · PDF/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download acme-backend-v2.pdf" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete acme-backend-v2.pdf" })).toBeTruthy();
		expect(screen.getByText("All Generated CVs loaded")).toBeTruthy();

		const section = screen.getByRole("heading", { name: "Generated CVs" }).closest("section");
		expect(section).toBeTruthy();
		expect(section?.className).toContain("shadow-cool-light-inner");
	});

	it("keeps Base CV management available when Generated CVs fail to load", async () => {
		renderDocuments({
			baseCvs: [baseCv()],
			generatedCvs: [],
			generatedCvsError: "Generated CVs could not be loaded.",
		});

		expect(await screen.findByText("engineering-profile.pdf")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Upload a Base CV" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download engineering-profile.pdf" })).toBeTruthy();
		expect(screen.getByText("Generated CVs could not be loaded.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
	});

	it("appends the next Generated CV page through Load more", async () => {
		vi.spyOn(api, "getGeneratedCvsPage").mockResolvedValue({
			items: [
				generatedCv({
					generatedCvId: 102,
					originalFilename: "older-acme.pdf",
					applicationTitle: "Platform Engineer",
					companyName: "Acme",
					createdAt: "2026-07-17T10:00:00Z",
				}),
			],
			total: 2,
			page: 1,
			size: 20,
		});

		renderDocuments({
			baseCvs: [],
			generatedCvs: [generatedCv()],
			generatedCvsPage: 0,
			generatedCvsTotal: 2,
		});

		expect(await screen.findByText("acme-backend-v2.pdf")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Load more" }));

		await waitFor(() => {
			expect(screen.getByText("older-acme.pdf")).toBeTruthy();
		});
		expect(screen.getByText("acme-backend-v2.pdf")).toBeTruthy();
		expect(screen.getByText("All Generated CVs loaded")).toBeTruthy();
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({ page: 1, size: 20 });
	});

	it("keeps appended Generated CVs after a Documents action revalidates the loader", async () => {
		vi.spyOn(api, "getGeneratedCvsPage").mockResolvedValue({
			items: [
				generatedCv({
					generatedCvId: 102,
					originalFilename: "older-acme.pdf",
					applicationTitle: "Platform Engineer",
					companyName: "Acme",
					createdAt: "2026-07-17T10:00:00Z",
				}),
			],
			total: 2,
			page: 1,
			size: 20,
		});

		let loaderData: DocumentsLoaderData = {
			baseCvs: [baseCv()],
			generatedCvs: [generatedCv()],
			generatedCvsPage: 0,
			generatedCvsTotal: 2,
			generatedCvsError: null,
		};

		const router = createMemoryRouter(
			[
				{
					path: "/documents",
					Component: DocumentsRoute,
					loader: () => loaderData,
					action: async () => {
						loaderData = {
							baseCvs: [],
							generatedCvs: [generatedCv()],
							generatedCvsPage: 0,
							generatedCvsTotal: 2,
							generatedCvsError: null,
						};
						return { ok: true, intent: "delete" };
					},
				},
			],
			{ initialEntries: ["/documents"] },
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("acme-backend-v2.pdf")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => {
			expect(screen.getByText("older-acme.pdf")).toBeTruthy();
		});

		vi.spyOn(window, "confirm").mockReturnValue(true);
		fireEvent.click(screen.getByRole("button", { name: "Delete engineering-profile.pdf" }));

		await waitFor(() => {
			expect(screen.queryByText("engineering-profile.pdf")).toBeNull();
		});
		expect(screen.getByText("acme-backend-v2.pdf")).toBeTruthy();
		expect(screen.getByText("older-acme.pdf")).toBeTruthy();
	});

	it("confirms before deleting a Generated CV", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const action = vi.fn();

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		await screen.findByText("acme-backend-v2.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Delete acme-backend-v2.pdf" }));

		expect(confirmSpy).toHaveBeenCalledWith("Permanently delete acme-backend-v2.pdf?");
		expect(action).not.toHaveBeenCalled();
		confirmSpy.mockRestore();
	});
});
