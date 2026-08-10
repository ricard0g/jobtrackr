import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { Navbar } from "@/components/shared/Navbar";
import type { User } from "@/types/user";

const user: User = {
	userId: "user-1",
	userEmail: "candidate@example.com",
	userDisplayName: "Candidate",
	userPictureUrl: null,
	userEnabled: true,
	userLocked: false,
	userDeletedAt: null,
	userPasswordChangedAt: null,
	userLastLoginAt: null,
	userCreatedAt: "2026-07-01T10:00:00.000Z",
	userUpdatedAt: "2026-07-01T10:00:00.000Z",
};

describe("Navbar", () => {
	it("offers Kanban and Documents without a Generate hub item", () => {
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <Navbar user={user} />,
					children: [
						{ index: true, element: null },
						{ path: "documents", element: null },
					],
				},
			],
			{ initialEntries: ["/"] },
		);
		render(<RouterProvider router={router} />);

		const nav = screen.getByRole("navigation", { name: "Main navigation" });
		expect(nav.querySelector('a[aria-label="Kanban"]')).toBeTruthy();
		expect(nav.querySelector('a[aria-label="Documents"]')).toBeTruthy();
		expect(nav.querySelector('a[aria-label="Generate"]')).toBeNull();
		expect(screen.queryByRole("link", { name: "Generate" })).toBeNull();
	});
});
