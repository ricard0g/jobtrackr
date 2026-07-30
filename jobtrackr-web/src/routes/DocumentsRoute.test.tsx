import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createMemoryRouter,
	Outlet,
	RouterProvider,
	type LoaderFunctionArgs,
	type RouteObject,
} from "react-router";

import { api, clearAccessToken, setAccessToken } from "@/lib/api";
import { DocumentsRoute, DocumentsRouteHydrateFallback } from "@/routes/DocumentsRoute";
import {
	documentsLoader,
	DOCUMENTS_RECENT_ROUTE_ID,
	ensureCanonicalDocumentsUrl,
	recentGeneratedCvsLoader,
	recentGeneratedCvsResourceLoader,
	recentGeneratedCvsShouldRevalidate,
	type DocumentsLoaderData,
} from "@/routes/documents-data";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCvSummary } from "@/types/generated-cv";

class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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
	clearAccessToken();
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

const recentResourceLoaderArgs = {
	request: new Request("http://localhost/resources/documents/recent"),
	params: {},
} as LoaderFunctionArgs;

type DocumentsRouteTestData = Partial<DocumentsLoaderData> & {
	recentGeneratedCvs?: GeneratedCvSummary[];
	recentGeneratedCvsError?: string | null;
};

const documentsRoute = ({
	loader,
	recentLoader = () => ({ items: [], error: null }),
	action,
	hydrateFallback = false,
}: {
	loader: RouteObject["loader"];
	recentLoader?: RouteObject["loader"];
	action?: RouteObject["action"];
	hydrateFallback?: boolean;
}): RouteObject => ({
	id: DOCUMENTS_RECENT_ROUTE_ID,
	path: "/documents",
	Component: Outlet,
	loader: recentLoader,
	action,
	shouldRevalidate: recentGeneratedCvsShouldRevalidate,
	HydrateFallback: hydrateFallback ? DocumentsRouteHydrateFallback : undefined,
	children: [
		{
			index: true,
			Component: DocumentsRoute,
			loader,
		},
	],
});

const renderDocuments = (
	data: DocumentsRouteTestData = {},
	action?: (args: { request: Request }) => Promise<unknown>,
	initialEntry = "/documents",
) => {
	const {
		recentGeneratedCvs = [],
		recentGeneratedCvsError = null,
		...documentsData
	} = data;
	const loaderData: DocumentsLoaderData = {
		baseCvs: [],
		generatedCvs: [],
		generatedCvsPage: 0,
		generatedCvsTotal: 0,
		generatedCvsError: null,
		...documentsData,
	};
	const router = createMemoryRouter(
		[
			documentsRoute({
				loader: ({ request }) => {
					ensureCanonicalDocumentsUrl(request);
					return loaderData;
				},
				recentLoader: () => ({
					items: recentGeneratedCvs,
					error: recentGeneratedCvsError,
				}),
				action,
			}),
			{ path: "/generate", element: <div>Generate route</div> },
			{
				path: "/applications/:applicationId",
				element: <div>Application detail route</div>,
			},
			{
				path: "/resources/documents/recent",
				loader: () => ({
					items: recentGeneratedCvs,
					error: recentGeneratedCvsError,
				}),
			},
		],
		{ initialEntries: [initialEntry] },
	);
	render(<RouterProvider router={router} />);
	return router;
};

const renderBaseDocuments = (
	data: DocumentsRouteTestData = {},
	action?: (args: { request: Request }) => Promise<unknown>,
) => renderDocuments(data, action, "/documents?tab=base");

describe("DocumentsRoute", () => {
	it("opens Generated CVs by default in an accessible tab shell", async () => {
		const router = renderDocuments();

		const heading = await screen.findByRole("heading", { name: "Documents" });
		expect(heading.className).toContain("sr-only");

		expect(screen.getByRole("tablist", { name: "Your Documents" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "Generated CVs" }).getAttribute("aria-selected")).toBe(
			"true",
		);
		expect(screen.getByRole("tab", { name: "Base CVs" }).getAttribute("aria-selected")).toBe(
			"false",
		);
		expect(screen.getByRole("tabpanel", { name: "Generated CVs" })).toBeTruthy();
		expect(screen.getAllByText("No Generated CVs yet")).toHaveLength(2);
		expect(screen.queryByText("No Base CVs yet")).toBeNull();

		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=1&sort=created&direction=desc",
			);
			expect(router.state.historyAction).toBe("REPLACE");
		});
	});

	it("opens the Base CVs panel from a direct URL and fills in its default table state", async () => {
		const router = renderDocuments({}, undefined, "/documents?tab=base");

		expect(
			(await screen.findByRole("tab", { name: "Base CVs" })).getAttribute("aria-selected"),
		).toBe("true");
		expect(screen.getByRole("tabpanel", { name: "Base CVs" })).toBeTruthy();
		expect(screen.getByText("No Base CVs yet")).toBeTruthy();
		expect(screen.queryByText("No Generated CVs yet")).toBeNull();

		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=base&page=1&sort=uploaded&direction=desc",
			);
		});
	});

	it("replaces invalid Documents query state with safe defaults", async () => {
		const router = renderDocuments(
			{},
			undefined,
			"/documents?tab=unknown&page=zero&sort=application&direction=sideways",
		);

		expect(
			(await screen.findByRole("tab", { name: "Generated CVs" })).getAttribute("aria-selected"),
		).toBe("true");
		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=1&sort=created&direction=desc",
			);
			expect(router.state.historyAction).toBe("REPLACE");
		});
	});

	it("pushes tab changes, resets destination state, and restores history with keyboard controls", async () => {
		const router = renderDocuments(
			{},
			undefined,
			"/documents?tab=generated&page=4&sort=name&direction=asc",
		);
		const generatedTab = await screen.findByRole("tab", { name: "Generated CVs" });
		const baseTab = screen.getByRole("tab", { name: "Base CVs" });

		act(() => generatedTab.focus());
		fireEvent.keyDown(generatedTab, { key: "ArrowRight" });
		await waitFor(() => {
			expect(document.activeElement).toBe(baseTab);
		});
		expect(generatedTab.getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(baseTab, { key: "Enter" });
		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=base&page=1&sort=uploaded&direction=desc",
			);
		});
		expect(baseTab.getAttribute("aria-selected")).toBe("true");

		await act(async () => {
			await router.navigate(-1);
		});
		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=4&sort=name&direction=asc",
			);
			expect(generatedTab.getAttribute("aria-selected")).toBe("true");
		});

		act(() => baseTab.focus());
		fireEvent.keyDown(baseTab, { key: "ArrowLeft" });
		await waitFor(() => {
			expect(document.activeElement).toBe(generatedTab);
		});
		expect(generatedTab.getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(generatedTab, { key: "ArrowRight" });
		await waitFor(() => {
			expect(document.activeElement).toBe(baseTab);
		});
		fireEvent.keyDown(baseTab, { key: " " });
		await waitFor(() => {
			expect(baseTab.getAttribute("aria-selected")).toBe("true");
		});
	});

	it("shows the upload guidance and empty state", async () => {
		renderDocuments();

		expect(await screen.findByRole("heading", { name: "Documents" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Generated CVs" })).toBeTruthy();
		const table = screen.getByRole("table", { name: "Generated CVs" });
		expect(within(table).getByText("No Generated CVs yet")).toBeTruthy();
		expect(within(table).getByRole("link", { name: "Generate" })).toBeTruthy();

		fireEvent.mouseDown(screen.getByRole("tab", { name: "Base CVs" }), {
			button: 0,
			ctrlKey: false,
		});
		expect(await screen.findByText("No Base CVs yet")).toBeTruthy();
		expect(screen.getByText("PDF, DOCX, or Markdown · 10 MB maximum")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Upload a Base CV" }).getAttribute("tabindex")).toBe(
			"0",
		);
	});

	it("renders document metadata and accessible actions", async () => {
		renderBaseDocuments({ baseCvs: [baseCv()] });

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
		renderBaseDocuments({
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

	it("renders the complete Generated CV table schema and agreed metadata formats", async () => {
		renderDocuments({
			baseCvs: [baseCv()],
			generatedCvs: [
				generatedCv({
					originalFilename: "acme-backend-v2.pdf",
					byteSize: 999,
				}),
				generatedCv({
					generatedCvId: 102,
					originalFilename: "platform-profile.md",
					format: "MARKDOWN",
					contentType: "text/markdown",
					byteSize: 1280,
					version: 7,
				}),
				generatedCv({
					generatedCvId: 103,
					originalFilename: "engineering-lead.docx",
					format: "DOCX",
					contentType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					byteSize: 2_202_010,
					version: 9,
				}),
			],
			generatedCvsTotal: 3,
		});

		const table = await screen.findByRole("table", { name: "Generated CVs" });
		expect(
			within(table)
				.getAllByRole("columnheader")
				.map((header) => header.textContent?.trim()),
		).toEqual(["Name", "Type", "Size", "Created", "Version", "Company", "Actions"]);
		expect(within(table).getByText("acme-backend-v2")).toBeTruthy();
		expect(within(table).queryByText("acme-backend-v2.pdf")).toBeNull();
		expect(within(table).getByText("PDF")).toBeTruthy();
		expect(within(table).getByText("999 B")).toBeTruthy();
		expect(within(table).getByText("platform-profile")).toBeTruthy();
		expect(within(table).getByText("Markdown")).toBeTruthy();
		expect(within(table).getByText("1.3 kB")).toBeTruthy();
		expect(within(table).getByText("engineering-lead")).toBeTruthy();
		expect(within(table).getByText("DOCX")).toBeTruthy();
		expect(within(table).getByText("2.1 MB")).toBeTruthy();
		expect(
			within(table).getAllByText(/Jul 18, 2026, \d{1,2}:00 [AP]M/),
		).toHaveLength(3);
		expect(within(table).getByText("2")).toBeTruthy();
		expect(within(table).getByText("7")).toBeTruthy();
		expect(within(table).getByText("9")).toBeTruthy();
		expect(within(table).getAllByText("Acme")).toHaveLength(3);
		expect(
			screen.getByRole("link", {
				name: "Open application for acme-backend-v2.pdf",
			}),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Preview acme-backend-v2.pdf" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download acme-backend-v2.pdf" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "More actions for acme-backend-v2.pdf" }),
		).toBeTruthy();

		const headerSurface = document.querySelector(
			'[data-slot="document-table-head-surface"]',
		);
		expect(headerSurface).toBeTruthy();
		expect(headerSurface?.className).toContain("inset-x-[10px]");
		expect(headerSurface?.className.split(/\s+/)).toContain(
			"shadow-cool-light-table-head",
		);

		const actionsHeader = within(table).getByRole("columnheader", { name: "Actions" });
		expect(actionsHeader.className).not.toContain("sticky");
		expect(actionsHeader.className.split(/\s+/)).toContain("max-w-[72px]");
		expect(actionsHeader.className.split(/\s+/)).toContain("md:w-[18%]");
		const actionsCell = screen
			.getByRole("button", { name: "Preview acme-backend-v2.pdf" })
			.closest("td");
		expect(actionsCell?.className).toContain("sticky");
		expect(actionsCell?.className).toContain("md:static");

		const mobileActions = screen.getByRole("button", {
			name: "More actions for acme-backend-v2.pdf on small screens",
		});
		fireEvent.click(mobileActions);
		const mobileMenu = await screen.findByRole("menu", {
			name: "More actions for acme-backend-v2.pdf on small screens",
		});
		expect(
			within(mobileMenu).getByRole("menuitem", { name: "Open Application" }),
		).toBeTruthy();
		expect(within(mobileMenu).getByRole("menuitem", { name: "Preview" })).toBeTruthy();
		expect(within(mobileMenu).getByRole("menuitem", { name: "Download" })).toBeTruthy();
		expect(within(mobileMenu).getByRole("menuitem", { name: "Delete" })).toBeTruthy();

		const section = screen.getByRole("heading", { name: "Generated CVs" }).closest("section");
		expect(section).toBeTruthy();
	});

	it("renders up to five Recent files with full filenames, local dates, and compact sizes", async () => {
		const recentGeneratedCvs = Array.from({ length: 6 }, (_, index) =>
			generatedCv({
				generatedCvId: index + 1,
				originalFilename: `recent-${index + 1}.docx`,
				format: "DOCX",
				contentType:
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				byteSize: index === 0 ? 12_800 : 2_202_010,
				createdAt: `2026-07-${String(25 - index).padStart(2, "0")}T20:30:00Z`,
			}),
		);
		renderDocuments({
			generatedCvs: [generatedCv()],
			generatedCvsTotal: 1,
			recentGeneratedCvs,
		});

		const recent = await screen.findByRole("region", { name: "Recent files" });
		expect(within(recent).getByRole("heading", { name: "Recent files" })).toBeTruthy();
		expect(within(recent).queryByText(/Recent files \d/)).toBeNull();
		expect(await within(recent).findAllByRole("button")).toHaveLength(5);
		expect(within(recent).getByText("recent-1.docx")).toBeTruthy();
		expect(within(recent).getByText(/Jul 25, 2026.*12.5 kB/)).toBeTruthy();
		expect(
			within(recent)
				.getByRole("button", { name: "Preview recent-1.docx from Recent files" })
				.getAttribute("title"),
		).toBe("recent-1.docx");
		expect(within(recent).queryByText("recent-6.docx")).toBeNull();
		expect(within(recent).queryByRole("menu")).toBeNull();
		expect(
			within(recent).queryByRole("button", { name: /Download|More actions|Delete/ }),
		).toBeNull();
	});

	it("opens Recent file previews with click, Enter, and Space", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockImplementation(
			() => new Promise(() => undefined),
		);
		renderDocuments({
			generatedCvs: [generatedCv()],
			generatedCvsTotal: 1,
			recentGeneratedCvs: [generatedCv()],
		});

		const recentCard = await screen.findByRole("button", {
			name: "Preview acme-backend-v2.pdf from Recent files",
		});
		fireEvent.click(recentCard);
		expect(await screen.findByRole("dialog", { name: "acme-backend-v2.pdf" })).toBeTruthy();
		expect(api.getGeneratedCvPreview).toHaveBeenCalledWith(101, expect.any(AbortSignal));

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.keyDown(recentCard, { key: "Enter" });
		expect(await screen.findByRole("dialog", { name: "acme-backend-v2.pdf" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.keyDown(recentCard, { key: " " });
		expect(await screen.findByRole("dialog", { name: "acme-backend-v2.pdf" })).toBeTruthy();
	});

	it("keeps a visible Recent files empty state linked to Generate", async () => {
		renderDocuments();

		const recent = await screen.findByRole("region", { name: "Recent files" });
		expect(await within(recent).findByText("No Generated CVs yet")).toBeTruthy();
		expect(within(recent).getByRole("link", { name: "Generate" })).toBeTruthy();
	});

	it("keeps Recent files usable when the Generated CV table fails", async () => {
		vi.spyOn(api, "getGeneratedCvPreview").mockImplementation(
			() => new Promise(() => undefined),
		);
		renderDocuments({
			generatedCvsError: "Generated CVs could not be loaded.",
			recentGeneratedCvs: [generatedCv()],
		});

		expect(await screen.findByText("Generated CVs could not be loaded.")).toBeTruthy();
		fireEvent.click(
			await screen.findByRole("button", {
				name: "Preview acme-backend-v2.pdf from Recent files",
			}),
		);
		expect(await screen.findByRole("dialog", { name: "acme-backend-v2.pdf" })).toBeTruthy();
	});

	it("retries a Recent files failure without replacing the usable table", async () => {
		const loader = vi.fn(
			(): DocumentsLoaderData => ({
				baseCvs: [],
				generatedCvs: [generatedCv()],
				generatedCvsPage: 0,
				generatedCvsTotal: 1,
				generatedCvsError: null,
			}),
		);
		let recentLoad = 0;
		const retryLoader = vi.fn(() => {
			recentLoad += 1;
			return recentLoad === 1
				? { items: [], error: "Recent files could not be loaded." }
				: { items: [generatedCv()], error: null };
		});
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader,
					recentLoader: retryLoader,
				}),
				{
					path: "/resources/documents/recent",
					loader: retryLoader,
				},
			],
			{
				initialEntries: ["/documents?tab=generated&page=1&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		const recent = await screen.findByRole("region", { name: "Recent files" });
		expect((await within(recent).findByRole("alert")).textContent).toContain(
			"Recent files could not be loaded.",
		);
		expect(screen.getByText("acme-backend-v2")).toBeTruthy();

		fireEvent.click(within(recent).getByRole("button", { name: "Retry" }));
		await waitFor(() => {
			expect(retryLoader).toHaveBeenCalledTimes(2);
		});

		expect(
			await within(recent).findByRole("button", {
				name: "Preview acme-backend-v2.pdf from Recent files",
			}),
		).toBeTruthy();
		expect(loader).toHaveBeenCalledTimes(1);
		expect(retryLoader).toHaveBeenCalledTimes(2);
		expect(screen.getByText("acme-backend-v2")).toBeTruthy();
	});

	it("shows five Recent file skeletons while the Recent resource loader is pending", async () => {
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader: (): DocumentsLoaderData => ({
						baseCvs: [],
						generatedCvs: [generatedCv()],
						generatedCvsPage: 0,
						generatedCvsTotal: 1,
						generatedCvsError: null,
					}),
					recentLoader: () => new Promise(() => undefined),
					hydrateFallback: true,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=1&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		const recent = await screen.findByRole("region", { name: "Recent files" });
		expect(within(recent).getAllByTestId("recent-file-skeleton")).toHaveLength(5);
	});

	it("keeps Generated CV rows and Name cells inert until Preview is explicitly selected", async () => {
		const preview = vi.spyOn(api, "getGeneratedCvPreview");
		renderDocuments({
			generatedCvs: [generatedCv()],
			generatedCvsTotal: 1,
		});

		const name = await screen.findByText("acme-backend-v2");
		fireEvent.click(name);
		fireEvent.click(name.closest("tr") as HTMLElement);

		expect(preview).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("opens a Generated CV Application after the explicit row actions in the agreed order", async () => {
		const initialEntry =
			"/documents?tab=generated&page=3&sort=company&direction=asc";
		const router = renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 21,
			},
			undefined,
			initialEntry,
		);

		const table = await screen.findByRole("table", { name: "Generated CVs" });
		const actionsCell = within(table).getByText("acme-backend-v2").closest("tr")?.lastElementChild;
		expect(actionsCell).toBeTruthy();

		const actionButtons = [
			within(actionsCell as HTMLElement).getByRole("link", {
				name: "Open application for acme-backend-v2.pdf",
			}),
			within(actionsCell as HTMLElement).getByRole("button", {
				name: "Preview acme-backend-v2.pdf",
			}),
			within(actionsCell as HTMLElement).getByRole("button", {
				name: "Download acme-backend-v2.pdf",
			}),
			within(actionsCell as HTMLElement).getByRole("button", {
				name: "More actions for acme-backend-v2.pdf",
			}),
		];

		expect(actionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
			"Open application for acme-backend-v2.pdf",
			"Preview acme-backend-v2.pdf",
			"Download acme-backend-v2.pdf",
			"More actions for acme-backend-v2.pdf",
		]);

		fireEvent.click(actionButtons[0]);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/applications/3");
			expect(router.state.location.state).toBeNull();
		});
	});

	it("shows visible tooltips for every icon-only Generated CV action", async () => {
		renderDocuments({
			generatedCvs: [generatedCv()],
			generatedCvsTotal: 1,
		});

		await screen.findByRole("table", { name: "Generated CVs" });
		const actions = [
			["Open application for acme-backend-v2.pdf", "Open Application"],
			["Preview acme-backend-v2.pdf", "Preview"],
			["Download acme-backend-v2.pdf", "Download"],
			["More actions for acme-backend-v2.pdf", "More actions"],
		] as const;

		for (const [accessibleName, tooltip] of actions) {
			const action =
				accessibleName.startsWith("Open")
					? screen.getByRole("link", { name: accessibleName })
					: screen.getByRole("button", { name: accessibleName });
			fireEvent.focus(action);
			expect((await screen.findByRole("tooltip")).textContent).toBe(tooltip);
			fireEvent.blur(action);
			await waitFor(() => {
				expect(screen.queryByRole("tooltip")).toBeNull();
			});
		}

		const smallScreenActions = screen.getByRole("button", {
			name: "More actions for acme-backend-v2.pdf on small screens",
		});
		fireEvent.focus(smallScreenActions);
		expect((await screen.findByRole("tooltip")).textContent).toBe("More actions");
	});

	it("scopes Generated CV download pending state and reports failure in a toast", async () => {
		let resolveDownload: ((value: unknown) => void) | undefined;
		const downloadResult = new Promise((resolve) => {
			resolveDownload = resolve;
		});
		const action = vi.fn(async () => downloadResult);
		const initialEntry =
			"/documents?tab=generated&page=2&sort=name&direction=desc";
		const router = renderDocuments(
			{
				generatedCvs: [
					generatedCv(),
					generatedCv({
						generatedCvId: 102,
						originalFilename: "platform-profile.pdf",
					}),
				],
				generatedCvsTotal: 12,
			},
			action,
			initialEntry,
		);

		await screen.findByRole("button", { name: "Download acme-backend-v2.pdf" });
		const selectedDownload = screen.getByRole("button", {
			name: "Download acme-backend-v2.pdf",
		});
		const otherDownload = screen.getByRole("button", {
			name: "Download platform-profile.pdf",
		});
		fireEvent.click(selectedDownload);

		await waitFor(() => {
			expect(action).toHaveBeenCalledTimes(1);
			expect(selectedDownload.getAttribute("aria-busy")).toBe("true");
			expect(selectedDownload.hasAttribute("disabled")).toBe(true);
			expect(selectedDownload.querySelector(".animate-spin")).toBeTruthy();
			expect(otherDownload.getAttribute("aria-busy")).toBe("false");
			expect(otherDownload.hasAttribute("disabled")).toBe(false);
		});
		fireEvent.click(selectedDownload);
		expect(action).toHaveBeenCalledTimes(1);

		await act(async () => {
			resolveDownload?.({
				ok: false,
				intent: "download-generated-cv",
				error: "The download link could not be prepared.",
			});
			await downloadResult;
		});

		const toast = await screen.findByRole("alert");
		expect(toast.textContent).toContain("The download link could not be prepared.");
		expect(toast.closest("tr")).toBeNull();
		expect(router.state.location.pathname + router.state.location.search).toBe(initialEntry);
		expect(screen.getByText("acme-backend-v2")).toBeTruthy();
	});

	it("keeps the small-screen action menu open to show row-scoped download pending state", async () => {
		let resolveDownload: ((value: unknown) => void) | undefined;
		const downloadResult = new Promise((resolve) => {
			resolveDownload = resolve;
		});
		const action = vi.fn(async () => downloadResult);

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		const trigger = await screen.findByRole("button", {
			name: "More actions for acme-backend-v2.pdf on small screens",
		});
		fireEvent.click(trigger);
		const menu = await screen.findByRole("menu", {
			name: "More actions for acme-backend-v2.pdf on small screens",
		});
		const download = within(menu).getByRole("menuitem", { name: "Download" });
		fireEvent.click(download);

		await waitFor(() => {
			expect(action).toHaveBeenCalledTimes(1);
			expect(
				screen.getByRole("menu", {
					name: "More actions for acme-backend-v2.pdf on small screens",
				}),
			).toBeTruthy();
			expect(download.getAttribute("aria-busy")).toBe("true");
			expect(download.querySelector(".animate-spin")).toBeTruthy();
		});

		await act(async () => {
			resolveDownload?.({
				ok: false,
				intent: "download-generated-cv",
				error: "The download link could not be prepared.",
			});
			await downloadResult;
		});

		await waitFor(() => {
			expect(
				screen.queryByRole("menu", {
					name: "More actions for acme-backend-v2.pdf on small screens",
				}),
			).toBeNull();
		});
		expect((await screen.findByRole("alert")).textContent).toContain(
			"The download link could not be prepared.",
		);

		fireEvent.click(trigger);
		expect(
			await screen.findByRole("menu", {
				name: "More actions for acme-backend-v2.pdf on small screens",
			}),
		).toBeTruthy();
	});

	it("sorts every data column through replace navigation and resets to page one", async () => {
		const router = renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 21,
			},
			undefined,
			"/documents?tab=generated&page=3&sort=created&direction=desc",
		);

		const table = await screen.findByRole("table", { name: "Generated CVs" });
		const createdHeader = within(table).getByRole("columnheader", { name: /Created/ });
		const nameHeader = within(table).getByRole("columnheader", { name: /Name/ });
		const actionsHeader = within(table).getByRole("columnheader", { name: "Actions" });
		const dataHeaders = within(table).getAllByRole("columnheader").slice(0, 6);
		expect(dataHeaders.every((header) => within(header).queryByRole("button") != null)).toBe(true);
		expect(createdHeader.getAttribute("aria-sort")).toBe("descending");
		expect(nameHeader.getAttribute("aria-sort")).toBe("none");
		expect(actionsHeader.getAttribute("aria-sort")).toBeNull();
		expect(within(actionsHeader).queryByRole("button")).toBeNull();

		fireEvent.click(within(nameHeader).getByRole("button"));
		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=1&sort=name&direction=asc",
			);
			expect(router.state.historyAction).toBe("REPLACE");
			expect(nameHeader.getAttribute("aria-sort")).toBe("ascending");
		});

		fireEvent.click(within(nameHeader).getByRole("button"));
		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=1&sort=name&direction=desc",
			);
			expect(nameHeader.getAttribute("aria-sort")).toBe("descending");
		});
	});

	it("keeps current rows visible and mutes the table while a new order loads", async () => {
		let loaderCall = 0;
		let resolveNextLoad: ((data: DocumentsLoaderData) => void) | undefined;
		const nextLoad = new Promise<DocumentsLoaderData>((resolve) => {
			resolveNextLoad = resolve;
		});
		const initialData: DocumentsLoaderData = {
			baseCvs: [],
			generatedCvs: [generatedCv()],
			generatedCvsPage: 0,
			generatedCvsTotal: 2,
			generatedCvsError: null,
		};
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader: ({ request }) => {
						ensureCanonicalDocumentsUrl(request);
						loaderCall += 1;
						return loaderCall === 1 ? initialData : nextLoad;
					},
					recentLoader: () => ({
						items: [generatedCv()],
						error: null,
					}),
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=1&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		const table = await screen.findByRole("table", { name: "Generated CVs" });
		fireEvent.click(
			within(within(table).getByRole("columnheader", { name: /Name/ })).getByRole("button"),
		);

		await waitFor(() => {
			expect(table.getAttribute("aria-busy")).toBe("true");
			expect(within(table).getByText("acme-backend-v2")).toBeTruthy();
			expect(
				screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled"),
			).toBe(true);
		});

		await act(async () => {
			resolveNextLoad?.({
				...initialData,
				generatedCvs: [
					generatedCv({
						generatedCvId: 102,
						originalFilename: "alpha-profile.pdf",
					}),
				],
			});
			await nextLoad;
		});

		await waitFor(() => {
			expect(table.getAttribute("aria-busy")).toBe("false");
			expect(within(table).getByText("alpha-profile")).toBeTruthy();
			expect(within(table).queryByText("acme-backend-v2")).toBeNull();
		});
	});

	it("loads Recent files independently with a fixed newest-first request", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "getBaseCvs").mockResolvedValue([]);
		const recentItems = Array.from({ length: 5 }, (_, index) =>
			generatedCv({
				generatedCvId: index + 1,
				originalFilename: `recent-${index + 1}.pdf`,
				createdAt: `2026-07-${String(25 - index).padStart(2, "0")}T10:00:00Z`,
			}),
		);
		vi.spyOn(api, "getGeneratedCvsPage").mockImplementation(async (params) =>
			params?.size === 5
				? { items: recentItems, total: 12, page: 0, size: 5 }
				: {
						items: [
							generatedCv({
								generatedCvId: 201,
								originalFilename: "sorted-table-row.pdf",
							}),
						],
						total: 12,
						page: 1,
						size: 10,
					},
		);
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader: documentsLoader,
					recentLoader: recentGeneratedCvsLoader,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=2&sort=name&direction=asc"],
			},
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("sorted-table-row")).toBeTruthy();
		expect(await screen.findByText("recent-1.pdf")).toBeTruthy();
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({
			page: 1,
			size: 10,
			sort: "name",
			direction: "asc",
		});
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({
			page: 0,
			size: 5,
			sort: "created",
			direction: "desc",
		});
	});

	it("does not refetch Recent files when the Generated CV table sort changes", async () => {
		const loaderData: DocumentsLoaderData = {
			baseCvs: [],
			generatedCvs: [generatedCv()],
			generatedCvsPage: 0,
			generatedCvsTotal: 1,
			generatedCvsError: null,
		};
		const loader = vi.fn(({ request }: { request: Request }) => {
			ensureCanonicalDocumentsUrl(request);
			return loaderData;
		});
		const recentLoader = vi.fn(() => ({
			items: [generatedCv({ originalFilename: "stable-recent.pdf" })],
			error: null,
		}));
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader,
					recentLoader,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=1&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("stable-recent.pdf")).toBeTruthy();
		const table = screen.getByRole("table", { name: "Generated CVs" });
		fireEvent.click(
			within(within(table).getByRole("columnheader", { name: /Name/ })).getByRole("button"),
		);

		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=1&sort=name&direction=asc",
			);
		});
		expect(screen.getByText("stable-recent.pdf")).toBeTruthy();
		expect(loader).toHaveBeenCalledTimes(2);
		expect(recentLoader).toHaveBeenCalledTimes(1);
	});

	it("does not refetch Recent files when the Generated CV table retries", async () => {
		let loaderCall = 0;
		const loader = vi.fn((): DocumentsLoaderData => {
			loaderCall += 1;
			return {
				baseCvs: [],
				generatedCvs: loaderCall === 1 ? [] : [generatedCv()],
				generatedCvsPage: 0,
				generatedCvsTotal: loaderCall === 1 ? 0 : 1,
				generatedCvsError:
					loaderCall === 1 ? "Generated CVs could not be loaded." : null,
			};
		});
		const recentLoader = vi.fn(() => ({
			items: [generatedCv({ originalFilename: "stable-recent.pdf" })],
			error: null,
		}));
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader,
					recentLoader,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=1&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("stable-recent.pdf")).toBeTruthy();
		const table = screen.getByRole("table", { name: "Generated CVs" });
		fireEvent.click(within(table).getByRole("button", { name: "Retry" }));

		expect(await within(table).findByText("acme-backend-v2")).toBeTruthy();
		expect(screen.getByText("stable-recent.pdf")).toBeTruthy();
		expect(loader).toHaveBeenCalledTimes(2);
		expect(recentLoader).toHaveBeenCalledTimes(1);
	});

	it("loads Recent files through the real authenticated resource loader", async () => {
		setAccessToken("test-token");
		const recentItems = Array.from({ length: 6 }, (_, index) =>
			generatedCv({
				generatedCvId: index + 1,
				originalFilename: `recent-${index + 1}.pdf`,
			}),
		);
		vi.spyOn(api, "getGeneratedCvsPage").mockResolvedValue({
			items: recentItems,
			total: 6,
			page: 0,
			size: 5,
		});

		const result = await recentGeneratedCvsResourceLoader(recentResourceLoaderArgs);

		expect(result).toEqual({
			items: recentItems.slice(0, 5),
			error: null,
		});
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({
			page: 0,
			size: 5,
			sort: "created",
			direction: "desc",
		});
	});

	it("returns a scoped Recent files error from the real resource loader", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "getGeneratedCvsPage").mockRejectedValue("network unavailable");

		await expect(recentGeneratedCvsResourceLoader(recentResourceLoaderArgs)).resolves.toEqual({
			items: [],
			error: "Recent files could not be loaded.",
		});
	});

	it("redirects an unauthenticated Recent files resource request to login", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("refresh unavailable"));

		try {
			await recentGeneratedCvsResourceLoader(recentResourceLoaderArgs);
			throw new Error("Expected an unauthenticated redirect.");
		} catch (error) {
			expect(error).toBeInstanceOf(Response);
			expect((error as Response).status).toBe(302);
			expect((error as Response).headers.get("Location")).toBe("/auth/login");
		}
	});

	it("normalizes a page beyond the Generated CV library to the last existing page", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "getBaseCvs").mockResolvedValue([]);
		vi.spyOn(api, "getGeneratedCvsPage").mockImplementation(async (params) => {
			const page = params?.page ?? 0;
			const size = params?.size ?? 10;
			return {
				items: page === 1 ? [generatedCv()] : [],
				total: 14,
				page,
				size,
			};
		});
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader: documentsLoader,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=9&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=2&sort=created&direction=desc",
			);
			expect(router.state.historyAction).toBe("REPLACE");
		});
		expect(await screen.findByText("11–14 of 14")).toBeTruthy();
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({
			page: 8,
			size: 10,
			sort: "created",
			direction: "desc",
		});
		expect(api.getGeneratedCvsPage).toHaveBeenCalledWith({
			page: 1,
			size: 10,
			sort: "created",
			direction: "desc",
		});
		expect(api.getGeneratedCvsPage).toHaveBeenCalledTimes(2);
	});

	it("normalizes an empty Generated CV library to page one", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "getBaseCvs").mockResolvedValue([]);
		vi.spyOn(api, "getGeneratedCvsPage").mockImplementation(async (params) => ({
			items: [],
			total: 0,
			page: params?.page ?? 0,
			size: params?.size ?? 10,
		}));
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader: documentsLoader,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=4&sort=company&direction=asc"],
			},
		);
		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=1&sort=company&direction=asc",
			);
		});
		const table = await screen.findByRole("table", { name: "Generated CVs" });
		expect(await within(table).findByText("No Generated CVs yet")).toBeTruthy();
		expect(screen.getByText("0–0 of 0")).toBeTruthy();
	});

	it("shows ten-row pagination with a result range and replace navigation", async () => {
		const router = renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsPage: 1,
				generatedCvsTotal: 25,
			},
			undefined,
			"/documents?tab=generated&page=2&sort=created&direction=desc",
		);

		expect(await screen.findByText("11–20 of 25")).toBeTruthy();
		const previous = screen.getByRole("button", { name: "Previous page" });
		const next = screen.getByRole("button", { name: "Next page" });
		expect(previous.hasAttribute("disabled")).toBe(false);
		expect(next.hasAttribute("disabled")).toBe(false);

		fireEvent.click(next);
		await waitFor(() => {
			expect(router.state.location.search).toBe(
				"?tab=generated&page=3&sort=created&direction=desc",
			);
			expect(router.state.historyAction).toBe("REPLACE");
		});
	});

	it("keeps Base CV management available when Generated CVs fail to load", async () => {
		renderDocuments({
			baseCvs: [baseCv()],
			generatedCvs: [],
			generatedCvsError: "Generated CVs could not be loaded.",
		});

		expect(await screen.findByText("Generated CVs could not be loaded.")).toBeTruthy();
		fireEvent.mouseDown(screen.getByRole("tab", { name: "Base CVs" }), {
			button: 0,
			ctrlKey: false,
		});
		expect(await screen.findByText("engineering-profile.pdf")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Upload a Base CV" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download engineering-profile.pdf" })).toBeTruthy();
	});

	it("deletes a Generated CV only after its document-specific confirmation dialog", async () => {
		const action = vi.fn(async ({ request }: { request: Request }) => {
			const formData = await request.formData();
			expect(formData.get("intent")).toBe("delete-generated-cv");
			expect(formData.get("generatedCvId")).toBe("101");
			return { ok: true, intent: "delete-generated-cv" };
		});

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		await screen.findByRole("button", { name: "More actions for acme-backend-v2.pdf" });
		fireEvent.click(
			screen.getByRole("button", { name: "More actions for acme-backend-v2.pdf" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("menu", {
					name: "More actions for acme-backend-v2.pdf",
				}),
			).getByRole("menuitem", { name: "Delete" }),
		);

		const dialog = await screen.findByRole("alertdialog", {
			name: "Delete acme-backend-v2.pdf?",
		});
		expect(dialog.textContent).toContain(
			"The Generated CV will be permanently deleted. Its Application, Kanban state, and generation history will stay intact.",
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
		expect(action).not.toHaveBeenCalled();

		fireEvent.click(
			screen.getByRole("button", { name: "More actions for acme-backend-v2.pdf" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("menu", {
					name: "More actions for acme-backend-v2.pdf",
				}),
			).getByRole("menuitem", { name: "Delete" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Delete acme-backend-v2.pdf?",
				}),
			).getByRole("button", { name: "Delete Generated CV" }),
		);

		await waitFor(() => {
			expect(action).toHaveBeenCalledTimes(1);
			expect(screen.queryByText("acme-backend-v2")).toBeNull();
		});
	});

	it("removes a deleted Generated CV from Recent files and refills the strip", async () => {
		let deletedOnServer = false;
		const deleted = generatedCv({
			generatedCvId: 101,
			originalFilename: "delete-me.pdf",
		});
		const initialRecent = [
			deleted,
			...Array.from({ length: 4 }, (_, index) =>
				generatedCv({
					generatedCvId: 102 + index,
					originalFilename: `keep-${index + 1}.pdf`,
				}),
			),
		];
		const refilledRecent = [
			...initialRecent.slice(1),
			generatedCv({
				generatedCvId: 106,
				originalFilename: "refilled.pdf",
			}),
		];
		const loader = vi.fn((): DocumentsLoaderData => {
			return {
				baseCvs: [],
				generatedCvs: deletedOnServer ? [] : [deleted],
				generatedCvsPage: 0,
				generatedCvsTotal: deletedOnServer ? 0 : 1,
				generatedCvsError: null,
			};
		});
		const recentLoader = vi.fn(() => ({
			items: deletedOnServer ? refilledRecent : initialRecent,
			error: null,
		}));
		const action = vi.fn(async () => {
			deletedOnServer = true;
			return { ok: true, intent: "delete-generated-cv" };
		});
		const router = createMemoryRouter(
			[
				documentsRoute({
					loader,
					recentLoader,
					action,
				}),
			],
			{
				initialEntries: ["/documents?tab=generated&page=1&sort=created&direction=desc"],
			},
		);
		render(<RouterProvider router={router} />);

		fireEvent.click(
			await screen.findByRole("button", { name: "More actions for delete-me.pdf" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("menu", {
					name: "More actions for delete-me.pdf",
				}),
			).getByRole("menuitem", { name: "Delete" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Delete delete-me.pdf?",
				}),
			).getByRole("button", { name: "Delete Generated CV" }),
		);

		await screen.findByRole("region", { name: "Recent files" });
		await waitFor(() => {
			const recent = screen.getByRole("region", { name: "Recent files" });
			expect(within(recent).queryByText("delete-me.pdf")).toBeNull();
			expect(within(recent).getByText("refilled.pdf")).toBeTruthy();
		});
		expect(action).toHaveBeenCalledTimes(1);
		expect(loader).toHaveBeenCalledTimes(2);
		expect(recentLoader).toHaveBeenCalledTimes(2);
	});

	it("submits Generated CV deletion without wrapping confirm in AlertDialogAction", async () => {
		const action = vi.fn(async ({ request }: { request: Request }) => {
			const formData = await request.formData();
			expect(formData.get("intent")).toBe("delete-generated-cv");
			expect(formData.get("generatedCvId")).toBe("101");
			return { ok: true, intent: "delete-generated-cv" };
		});

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "More actions for acme-backend-v2.pdf" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("menu", {
					name: "More actions for acme-backend-v2.pdf",
				}),
			).getByRole("menuitem", { name: "Delete" }),
		);

		const confirm = within(
			await screen.findByRole("alertdialog", {
				name: "Delete acme-backend-v2.pdf?",
			}),
		).getByRole("button", { name: "Delete Generated CV" });

		// AlertDialogAction closes/unmounts the dialog on click and can swallow the
		// nested form submit in the browser; confirm must be a plain button.
		expect(confirm.getAttribute("data-slot")).toBe("button");
		expect((confirm as HTMLButtonElement).type).toBe("button");

		fireEvent.click(confirm);

		await waitFor(() => {
			expect(action).toHaveBeenCalledTimes(1);
		});
	});

	it("does not show the empty-library state after deleting the last row while total stays positive", async () => {
		const action = vi.fn(async () => ({ ok: true, intent: "delete-generated-cv" }));

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 21,
			},
			action,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "More actions for acme-backend-v2.pdf" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("menu", {
					name: "More actions for acme-backend-v2.pdf",
				}),
			).getByRole("menuitem", { name: "Delete" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Delete acme-backend-v2.pdf?",
				}),
			).getByRole("button", { name: "Delete Generated CV" }),
		);

		await waitFor(() => {
			expect(action).toHaveBeenCalledTimes(1);
			expect(screen.queryByText("acme-backend-v2")).toBeNull();
		});

		const table = screen.getByRole("table", { name: "Generated CVs" });
		expect(within(table).queryByText("No Generated CVs in your library")).toBeNull();
		expect(screen.getByText(/of 20$/)).toBeTruthy();
	});

	it("keeps a Generated CV visible and toasts when deletion fails", async () => {
		const action = vi.fn(async () => ({
			ok: false,
			intent: "delete-generated-cv",
			error: "This Generated CV could not be deleted.",
		}));

		renderDocuments(
			{
				generatedCvs: [generatedCv()],
				generatedCvsTotal: 1,
			},
			action,
		);

		await screen.findByRole("button", { name: "More actions for acme-backend-v2.pdf" });
		fireEvent.click(
			screen.getByRole("button", { name: "More actions for acme-backend-v2.pdf" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("menu", {
					name: "More actions for acme-backend-v2.pdf",
				}),
			).getByRole("menuitem", { name: "Delete" }),
		);
		fireEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Delete acme-backend-v2.pdf?",
				}),
			).getByRole("button", { name: "Delete Generated CV" }),
		);

		const toast = await screen.findByRole("alert");
		expect(toast.textContent).toContain("This Generated CV could not be deleted.");
		expect(toast.closest("tr")).toBeNull();
		expect(screen.getByText("acme-backend-v2")).toBeTruthy();
	});

	it("opens the preview dialog with a loading state when selecting a Base CV row", async () => {
		vi.spyOn(api, "getBaseCvPreview").mockImplementation(
			() => new Promise(() => undefined),
		);

		renderBaseDocuments({ baseCvs: [baseCv()] });

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

		renderBaseDocuments({
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

		renderBaseDocuments({
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

		renderBaseDocuments({
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

		renderBaseDocuments({
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

		renderBaseDocuments({ baseCvs: [baseCv()] });
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

		renderBaseDocuments({ baseCvs: [baseCv()] }, action);
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

		renderBaseDocuments({ baseCvs: [baseCv()] });
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

		renderBaseDocuments({ baseCvs: [baseCv()] });
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

		renderBaseDocuments({ baseCvs: [baseCv()] });
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

		await screen.findByRole("button", { name: "Preview acme-backend-v2.pdf" });
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

		await screen.findByRole("button", { name: "Preview acme-backend-v2.md" });
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

		await screen.findByRole("button", { name: "Preview acme-backend-v2.docx" });
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

		await screen.findByRole("button", { name: "Preview acme-backend-v2.pdf" });
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

		await screen.findByRole("button", { name: "Preview acme-backend-v2.pdf" });
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

		renderBaseDocuments({ baseCvs: [baseCv()] });
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
			renderBaseDocuments({ baseCvs: [baseCv()] });
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
