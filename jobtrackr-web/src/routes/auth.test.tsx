import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AUTH_BASE_URL } from "@/lib/api-config";
import { loginAction, publicAuthLoader, registerAction } from "@/routes/auth-data";
import { LoginPage, RegisterPage } from "@/routes/auth";
import { mswServer, startMsw } from "@/test/msw";

startMsw();

afterEach(() => {
	cleanup();
	window.sessionStorage.clear();
});

function renderAuth(initialEntry: string) {
	const router = createMemoryRouter(
		[
			{
				path: "/auth/login",
				Component: LoginPage,
				loader: publicAuthLoader,
				action: loginAction,
				HydrateFallback: () => null,
			},
			{
				path: "/auth/register",
				Component: RegisterPage,
				loader: publicAuthLoader,
				action: registerAction,
				HydrateFallback: () => null,
			},
		],
		{ initialEntries: [initialEntry] },
	);

	render(<RouterProvider router={router} />);
	return router;
}

function enableGoogle() {
	mswServer.use(
		http.get(`${AUTH_BASE_URL}/providers`, () => {
			return HttpResponse.json({ google: true });
		}),
	);
}

describe("Google sign-in on auth screens", () => {
	it("hides Continue with Google when discovery reports it disabled", async () => {
		renderAuth("/auth/login");

		await screen.findByRole("heading", { name: "Log in" });
		expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
	});

	it("shows Continue with Google on login and register when enabled", async () => {
		enableGoogle();
		renderAuth("/auth/login");

		const loginLink = await screen.findByRole("link", { name: "Continue with Google" });
		expect(loginLink.getAttribute("href")).toBe(
			`${AUTH_BASE_URL}/oauth2/authorization/google`,
		);
		expect(loginLink.getAttribute("href")).not.toContain("prompt=");

		cleanup();
		enableGoogle();
		renderAuth("/auth/register");

		const registerLink = await screen.findByRole("link", { name: "Continue with Google" });
		expect(registerLink.getAttribute("href")).toBe(
			`${AUTH_BASE_URL}/oauth2/authorization/google?screen=register`,
		);
	});

	it("keeps an allowlisted oauthResult banner after consuming the query code", async () => {
		const router = renderAuth(
			`/auth/login?oauthResult=failed&returnTo=${encodeURIComponent("/settings/account")}`,
		);

		await screen.findByText("Google sign-in failed. Try again or use your password.");
		await waitFor(() => {
			expect(router.state.location.search).not.toContain("oauthResult");
		});
		expect(router.state.location.search).toContain("returnTo=%2Fsettings%2Faccount");
	});

	it("shows the unavailable banner when Google is disabled", async () => {
		renderAuth("/auth/login?oauthResult=unavailable");

		await screen.findByText("Google sign-in is currently unavailable.");
		expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
	});
});
