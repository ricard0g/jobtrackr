import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { api } from "@/lib/api";
import { DocumentsRoute } from "@/routes/DocumentsRoute";
import type { DocumentsLoaderData } from "@/routes/documents-data";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCvSummary } from "@/types/generated-cv";

vi.mock("react-pdf", async () => {
	const React = await import("react");
	return {
		Document: ({
			children,
			onLoadSuccess,
			loading,
		}: {
			children: React.ReactNode;
			onLoadSuccess?: (info: { numPages: number }) => void;
			loading?: React.ReactNode;
		}) => {
			const notified = React.useRef(false);
			React.useEffect(() => {
				if (notified.current) return;
				notified.current = true;
				onLoadSuccess?.({ numPages: 3 });
			}, [onLoadSuccess]);
			return (
				<div data-testid="pdf-document">
					{loading}
					{children}
				</div>
			);
		},
		Page: ({
			pageNumber,
			scale,
			onLoadSuccess,
			onRenderAnnotationLayerSuccess,
		}: {
			pageNumber: number;
			scale: number;
			onLoadSuccess?: (page: { originalWidth: number }) => void;
			onRenderAnnotationLayerSuccess?: () => void;
		}) => {
			const notified = React.useRef(false);
			React.useEffect(() => {
				if (notified.current) return;
				notified.current = true;
				onLoadSuccess?.({ originalWidth: 800 });
				onRenderAnnotationLayerSuccess?.();
			}, [onLoadSuccess, onRenderAnnotationLayerSuccess]);
			return (
				<div data-testid="pdf-page" data-page={pageNumber} data-scale={String(scale)}>
					Page {pageNumber}
				</div>
			);
		},
		pdfjs: {
			GlobalWorkerOptions: { workerSrc: "" },
			version: "5.4.296",
		},
	};
});

vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

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

	it("opens the preview dialog with a loading state when selecting a Base CV row", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockImplementation(
			() => new Promise(() => undefined),
		);

		renderDocuments({ baseCvs: [baseCv()] });

		await screen.findByText("engineering-profile.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));

		expect(await screen.findByRole("dialog", { name: "engineering-profile.pdf" })).toBeTruthy();
		expect(screen.getByText("Loading preview…")).toBeTruthy();
		expect(api.getBaseCvPreview).toHaveBeenCalledWith(1, expect.any(AbortSignal));
	});

	it("renders PDF page controls after the preview loads", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
		const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-1");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

		renderDocuments({ baseCvs: [baseCv()] });
		await screen.findByText("engineering-profile.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));

		expect(await screen.findByText("Page 1 of 3")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Previous page" }).hasAttribute("disabled")).toBe(
			true,
		);
		expect(screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")).toBe(false);
		expect(screen.getByRole("button", { name: "Zoom out" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Fit to width" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		expect(createObjectURL).toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Next page" }));
		expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
		expect(screen.getByTestId("pdf-page").getAttribute("data-page")).toBe("2");
	});

	it("does not open preview when Download or Delete is used", async () => {
		const previewSpy = vi.spyOn(api, "getBaseCvPreview");
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const action = vi.fn(async () => ({ ok: true, intent: "download", uri: "https://signed.example/cv" }));

		renderDocuments({ baseCvs: [baseCv()] }, action);
		await screen.findByText("engineering-profile.pdf");

		fireEvent.click(screen.getByRole("button", { name: "Download engineering-profile.pdf" }));
		fireEvent.click(screen.getByRole("button", { name: "Delete engineering-profile.pdf" }));

		await waitFor(() => {
			expect(action).toHaveBeenCalled();
		});
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(previewSpy).not.toHaveBeenCalled();
		expect(confirmSpy).toHaveBeenCalled();
	});

	it("keeps the dialog open with retry actions when preview fails", async () => {
		vi.spyOn(api, "getBaseCvPreview")
			.mockRejectedValueOnce(new Error("Preview could not be loaded."))
			.mockImplementation(() => new Promise(() => undefined));

		renderDocuments({ baseCvs: [baseCv()] });
		await screen.findByText("engineering-profile.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));

		expect(await screen.findByText("Preview could not be loaded.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Retry Preview" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		expect(screen.getByRole("dialog")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Retry Preview" }));
		expect(await screen.findByText("Loading preview…")).toBeTruthy();
		expect(api.getBaseCvPreview).toHaveBeenCalledTimes(2);
	});

	it("aborts the preview request and revokes the object URL on close", async () => {
		let capturedSignal: AbortSignal | undefined;
		vi.spyOn(api, "getBaseCvPreview").mockImplementation((_id, signal) => {
			capturedSignal = signal;
			return Promise.resolve(new Blob(["%PDF"], { type: "application/pdf" }));
		});
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-close");
		const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

		renderDocuments({ baseCvs: [baseCv()] });
		await screen.findByText("engineering-profile.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));
		expect(await screen.findByText("Page 1 of 3")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		expect(capturedSignal?.aborted).toBe(true);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-close");
	});

	it("disables zoom controls at the lower and upper bounds", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-zoom");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

		renderDocuments({ baseCvs: [baseCv()] });
		await screen.findByText("engineering-profile.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));
		expect(await screen.findByText("Page 1 of 3")).toBeTruthy();

		const zoomOut = screen.getByRole("button", { name: "Zoom out" });
		const zoomIn = screen.getByRole("button", { name: "Zoom in" });

		for (let i = 0; i < 12; i += 1) fireEvent.click(zoomOut);
		expect(zoomOut.hasAttribute("disabled")).toBe(true);

		for (let i = 0; i < 20; i += 1) fireEvent.click(zoomIn);
		expect(zoomIn.hasAttribute("disabled")).toBe(true);
		expect(zoomOut.hasAttribute("disabled")).toBe(false);
	});
});
