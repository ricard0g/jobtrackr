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
	action?: (args: { request: Request }) => Promise<unknown>,
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
		expect(screen.getByRole("button", { name: "Preview acme-backend-v2.pdf" })).toBeTruthy();
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
			size: 10,
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
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({ page: 1, size: 10 });
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
			size: 10,
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

	it("previews DOCX Base CVs through the PDF viewer after conversion", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockResolvedValue(
			new Blob(["%PDF-1.4 converted"], { type: "application/pdf" }),
		);

		renderDocuments({
			baseCvs: [
				baseCv({
					baseCvId: 3,
					originalFilename: "resume.docx",
					format: "DOCX",
					contentType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					byteSize: 2048,
				}),
			],
		});

		await screen.findByText("resume.docx");
		fireEvent.click(screen.getByRole("button", { name: "Preview resume.docx" }));

		expect(await screen.findByRole("dialog", { name: "resume.docx" })).toBeTruthy();
		expect(await screen.findByTestId("pdf-document")).toBeTruthy();
		expect(api.getBaseCvPreview).toHaveBeenCalledWith(3, expect.any(AbortSignal));
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
	});

	it("keeps Retry Preview and Download Original available when DOCX conversion fails", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockRejectedValue(new Error("Preview could not be loaded."));

		renderDocuments({
			baseCvs: [
				baseCv({
					baseCvId: 3,
					originalFilename: "resume.docx",
					format: "DOCX",
					contentType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					byteSize: 2048,
				}),
			],
		});

		await screen.findByText("resume.docx");
		fireEvent.click(screen.getByRole("button", { name: "Preview resume.docx" }));

		expect(await screen.findByText("Preview could not be loaded.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Retry Preview" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
	});

	it("renders Markdown with GFM structures, safe links, and no PDF controls", async () => {
		const markdown = [
			"# Candidate Evidence",
			"",
			"| Skill | Level |",
			"| --- | --- |",
			"| Java | Senior |",
			"",
			"- [x] Ownership checked",
			"- [ ] Still drafting",
			"",
			'<script>window.__xss = true</script>',
			'<iframe src="https://evil.example"></iframe>',
			"",
			"See [profile](https://example.com/profile).",
		].join("\n");

		vi.spyOn(api, "getBaseCvPreview").mockResolvedValue(
			new Blob([markdown], { type: "text/markdown; charset=UTF-8" }),
		);

		renderDocuments({
			baseCvs: [
				baseCv({
					baseCvId: 2,
					originalFilename: "notes.md",
					format: "MARKDOWN",
					contentType: "text/markdown",
					byteSize: markdown.length,
				}),
			],
		});

		await screen.findByText("notes.md");
		fireEvent.click(screen.getByRole("button", { name: "Preview notes.md" }));

		expect(await screen.findByRole("heading", { name: "Candidate Evidence" })).toBeTruthy();
		const previewScroll = screen.getByTestId("markdown-preview-scroll");
		expect(screen.getByRole("table")).toBeTruthy();
		expect(screen.getByText("Java")).toBeTruthy();
		expect(screen.getByRole("checkbox", { name: "Ownership checked" })).toBeTruthy();
		expect(previewScroll.textContent).not.toContain("window.__xss = true");
		expect(previewScroll.querySelector("iframe")).toBeNull();
		expect(previewScroll.querySelector("script")).toBeNull();

		const link = screen.getByRole("link", { name: "profile" });
		expect(link.getAttribute("href")).toBe("https://example.com/profile");
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noopener noreferrer");

		expect(screen.queryByRole("button", { name: "Previous page" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		expect(previewScroll).toBeTruthy();
	});

	it("keeps Markdown preview retry and cleanup behavior", async () => {
		vi.spyOn(api, "getBaseCvPreview")
			.mockRejectedValueOnce(new Error("Preview could not be loaded."))
			.mockResolvedValueOnce(
				new Blob(["# Recovered"], { type: "text/markdown; charset=UTF-8" }),
			);

		renderDocuments({
			baseCvs: [
				baseCv({
					baseCvId: 2,
					originalFilename: "notes.md",
					format: "MARKDOWN",
					contentType: "text/markdown",
					byteSize: 64,
				}),
			],
		});

		await screen.findByText("notes.md");
		fireEvent.click(screen.getByRole("button", { name: "Preview notes.md" }));

		expect(await screen.findByText("Preview could not be loaded.")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Retry Preview" }));

		expect(await screen.findByRole("heading", { name: "Recovered" })).toBeTruthy();
		expect(api.getBaseCvPreview).toHaveBeenCalledTimes(2);

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
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
		const getBaseCvPreview = vi.spyOn(api, "getBaseCvPreview").mockImplementation((_id, signal) => {
			capturedSignal = signal;
			return Promise.resolve(new Blob(["%PDF"], { type: "application/pdf" }));
		});
		const cancelCvGeneration = vi.spyOn(api, "cancelCvGeneration");
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
		expect(getBaseCvPreview).toHaveBeenCalledTimes(1);
		expect(cancelCvGeneration).not.toHaveBeenCalled();
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

	it("opens the preview dialog when selecting a Generated CV row without triggering Download", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockImplementation(
			() => new Promise(() => undefined),
		);
		vi.spyOn(api, "getBaseCvPreview");
		const action = vi.fn();

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		await screen.findByText("acme-backend-v2.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview acme-backend-v2.pdf" }));

		expect(await screen.findByRole("dialog", { name: "acme-backend-v2.pdf" })).toBeTruthy();
		expect(screen.getByText("Loading preview…")).toBeTruthy();
		expect(api.getGeneratedCvPreview).toHaveBeenCalledWith(101, expect.any(AbortSignal));
		expect(api.getBaseCvPreview).not.toHaveBeenCalled();
		expect(action).not.toHaveBeenCalled();
	});

	it("previews Generated CV Markdown through the shared safe viewer", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockResolvedValue(
			new Blob(["# Tailored CV\n\nSee [profile](https://example.com/p)."], {
				type: "text/markdown; charset=UTF-8",
			}),
		);

		renderDocuments({
			generatedCvs: [
				generatedCv({
					generatedCvId: 202,
					originalFilename: "acme-backend-v2.md",
					format: "MARKDOWN",
					contentType: "text/markdown",
				}),
			],
			generatedCvsTotal: 1,
		});

		await screen.findByText("acme-backend-v2.md");
		fireEvent.click(screen.getByRole("button", { name: "Preview acme-backend-v2.md" }));

		expect(await screen.findByRole("heading", { name: "Tailored CV" })).toBeTruthy();
		expect(api.getGeneratedCvPreview).toHaveBeenCalledWith(202, expect.any(AbortSignal));
		expect(screen.queryByRole("button", { name: "Previous page" })).toBeNull();
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
	});

	it("previews Generated CV DOCX through the shared PDF viewer", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockResolvedValue(
			new Blob(["%PDF-1.4 generated docx"], { type: "application/pdf" }),
		);

		renderDocuments({
			generatedCvs: [
				generatedCv({
					generatedCvId: 303,
					originalFilename: "acme-backend-v2.docx",
					format: "DOCX",
					contentType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				}),
			],
			generatedCvsTotal: 1,
		});

		await screen.findByText("acme-backend-v2.docx");
		fireEvent.click(screen.getByRole("button", { name: "Preview acme-backend-v2.docx" }));

		expect(await screen.findByRole("dialog", { name: "acme-backend-v2.docx" })).toBeTruthy();
		expect(await screen.findByTestId("pdf-document")).toBeTruthy();
		expect(api.getGeneratedCvPreview).toHaveBeenCalledWith(303, expect.any(AbortSignal));
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
	});

	it("keeps Retry Preview and Download Original when Generated CV preview fails", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockRejectedValue(
			new Error("Preview could not be loaded."),
		);

		renderDocuments({
			generatedCvs: [generatedCv()],
			generatedCvsTotal: 1,
		});

		await screen.findByText("acme-backend-v2.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview acme-backend-v2.pdf" }));

		expect(await screen.findByText("Preview could not be loaded.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Retry Preview" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
	});

	it("downloads the original Generated CV from the preview dialog via download-generated-cv", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockResolvedValue(
			new Blob(["%PDF"], { type: "application/pdf" }),
		);
		const action = vi.fn(async ({ request }: { request: Request }) => {
			const formData = await request.formData();
			expect(formData.get("intent")).toBe("download-generated-cv");
			expect(formData.get("generatedCvId")).toBe("101");
			return {
				ok: true,
				intent: "download-generated-cv",
				uri: "https://signed.example/original.pdf",
			};
		});

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		await screen.findByText("acme-backend-v2.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview acme-backend-v2.pdf" }));
		expect(await screen.findByText("Page 1 of 3")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Download Original" }));
		await waitFor(() => {
			expect(action).toHaveBeenCalled();
		});
	});

	it("closes the preview dialog with Escape and keeps focus management inside the dialog", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-a11y");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

		renderDocuments({ baseCvs: [baseCv()] });
		await screen.findByText("engineering-profile.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));

		const dialog = await screen.findByRole("dialog", { name: "engineering-profile.pdf" });
		expect(dialog.contains(document.activeElement)).toBe(true);

		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	it("keeps preview controls usable at a reduced mobile viewport width", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-mobile");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

		const originalInnerWidth = window.innerWidth;
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
		window.dispatchEvent(new Event("resize"));

		try {
			renderDocuments({ baseCvs: [baseCv()] });
			await screen.findByText("engineering-profile.pdf");
			fireEvent.click(screen.getByRole("button", { name: "Preview engineering-profile.pdf" }));

			expect(await screen.findByRole("dialog", { name: "engineering-profile.pdf" })).toBeTruthy();
			expect(screen.getByRole("button", { name: "Previous page" })).toBeTruthy();
			expect(screen.getByRole("button", { name: "Next page" })).toBeTruthy();
			expect(screen.getByRole("button", { name: "Zoom out" })).toBeTruthy();
			expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
			expect(screen.getByRole("button", { name: "Download Original" })).toBeTruthy();
			expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();

			fireEvent.click(screen.getByRole("button", { name: "Next page" }));
			expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
		} finally {
			Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
			window.dispatchEvent(new Event("resize"));
		}
	});
});
