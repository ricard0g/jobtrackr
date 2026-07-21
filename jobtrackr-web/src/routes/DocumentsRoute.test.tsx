import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { DocumentsRoute } from "@/routes/DocumentsRoute";
import type { BaseCv } from "@/types/base-cv";

afterEach(cleanup);

const renderDocuments = (baseCvs: BaseCv[]) => {
	const router = createMemoryRouter([
		{
			path: "/documents",
			Component: DocumentsRoute,
			loader: () => ({ baseCvs }),
		},
	], { initialEntries: ["/documents"] });
	render(<RouterProvider router={router} />);
};

describe("DocumentsRoute", () => {
	it("shows the upload guidance and empty state", async () => {
		renderDocuments([]);

		expect(await screen.findByRole("heading", { name: "Documents" })).toBeTruthy();
		expect(screen.getByText("No Base CVs yet")).toBeTruthy();
		expect(screen.getByText("PDF, DOCX, or Markdown · 10 MB maximum")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Upload a Base CV" }).getAttribute("tabindex")).toBe("0");
	});

	it("renders document metadata and accessible actions", async () => {
		renderDocuments([
			{
				baseCvId: 1,
				originalFilename: "engineering-profile.pdf",
				format: "PDF",
				contentType: "application/pdf",
				byteSize: 1_572_864,
				createdAt: "2026-07-16T12:00:00Z",
			},
		]);

		expect(await screen.findByText("engineering-profile.pdf")).toBeTruthy();
		expect(screen.getByText(/PDF · 1.5 MB/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download engineering-profile.pdf" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete engineering-profile.pdf" })).toBeTruthy();
	});

	it("disables upload controls when the quota is full", async () => {
		const documents = Array.from({ length: 20 }, (_, index): BaseCv => ({
			baseCvId: index + 1,
			originalFilename: `cv-${index + 1}.md`,
			format: "MARKDOWN",
			contentType: "text/markdown",
			byteSize: 1024,
			createdAt: "2026-07-16T12:00:00Z",
		}));
		renderDocuments(documents);

		const upload = await screen.findByRole("button", { name: "Upload a Base CV" });
		expect(upload.getAttribute("aria-disabled")).toBe("true");
		expect(screen.getByText("Delete a Base CV to make room for another upload.")).toBeTruthy();
	});
});
