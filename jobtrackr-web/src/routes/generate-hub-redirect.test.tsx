import { render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { generateHubRedirectLoader } from "@/routes/generate-hub-redirect";

describe("/generate hub retirement", () => {
	it("redirects visiting /generate to the Kanban root", async () => {
		const router = createMemoryRouter(
			[
				{ index: true, element: <div>Kanban root</div> },
				{ path: "generate", loader: generateHubRedirectLoader },
			],
			{ initialEntries: ["/generate"] },
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/");
		});
	});
});
