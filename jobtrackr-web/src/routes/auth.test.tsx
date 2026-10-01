import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AUTH_BASE_URL } from "@/lib/api-config";
import {
	loginAction,
	publicAuthLoader,
	registerAction,
} from "@/routes/auth-data";
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
			{ path: "/", Component: () => <h1>Workspace</h1> },
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
		expect(
			screen.queryByRole("link", { name: "Continue with Google" }),
		).toBeNull();
	});

	it("shows Continue with Google on login and explains payment before registration", async () => {
		enableGoogle();
		renderAuth("/auth/login");

		const loginLink = await screen.findByRole("link", {
			name: "Continue with Google",
		});
		expect(loginLink.getAttribute("href")).toBe(
			`${AUTH_BASE_URL}/oauth2/authorization/google`,
		);
		expect(loginLink.getAttribute("href")).not.toContain("prompt=");

		cleanup();
		enableGoogle();
		renderAuth("/auth/register");

		await screen.findByText(/Complete payment first/);
		expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
		expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
	});

	it("keeps an allowlisted oauthResult banner after consuming the query code", async () => {
		const router = renderAuth(
			`/auth/login?oauthResult=failed&returnTo=${encodeURIComponent("/settings/account")}`,
		);

		await screen.findByText(
			"Google sign-in failed. Try again or use your password.",
		);
		await waitFor(() => {
			expect(router.state.location.search).not.toContain("oauthResult");
		});
		expect(router.state.location.search).toContain(
			"returnTo=%2Fsettings%2Faccount",
		);
	});

	it("shows the unavailable banner when Google is disabled", async () => {
		renderAuth("/auth/login?oauthResult=unavailable");

		await screen.findByText("Google sign-in is currently unavailable.");
		expect(
			screen.queryByRole("link", { name: "Continue with Google" }),
		).toBeNull();
	});
});

describe("paid password registration", () => {
	it("fixes the Checkout Email and submits the verification token before opening the workspace", async () => {
		window.sessionStorage.setItem(
			"jobtrackr-registration-token",
			"verified-link",
		);
		let submitted: unknown;
		mswServer.use(
			http.get(`${AUTH_BASE_URL}/registration/verification`, ({ request }) => {
				expect(request.headers.get("X-Verification-Token")).toBe(
					"verified-link",
				);
				return HttpResponse.json({
					email: "checkout@example.com",
					paidUntil: "2099-10-08T00:00:00Z",
				});
			}),
			http.post(`${AUTH_BASE_URL}/register`, async ({ request }) => {
				submitted = await request.json();
				return HttpResponse.json(
					{ accessToken: "registered-access-token" },
					{ status: 201 },
				);
			}),
		);
		renderAuth("/auth/register");
		const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
		expect(email.value).toBe("checkout@example.com");
		expect(email.readOnly).toBe(true);
		fireEvent.change(screen.getByLabelText("Display name"), {
			target: { value: "Buyer" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "StrongPassword123!" },
		});
		fireEvent.submit(
			screen.getByRole("button", { name: "Register" }).closest("form")!,
		);
		await screen.findByRole("heading", { name: "Workspace" });
		expect(submitted).toEqual({
			email: "checkout@example.com",
			password: "StrongPassword123!",
			displayName: "Buyer",
			verificationToken: "verified-link",
		});
		expect(
			window.sessionStorage.getItem("jobtrackr-registration-token"),
		).toBeNull();
	});

	it("explains an expired link without offering a password form", async () => {
		window.sessionStorage.setItem(
			"jobtrackr-registration-token",
			"expired-link",
		);
		mswServer.use(
			http.get(`${AUTH_BASE_URL}/registration/verification`, () => {
				return HttpResponse.json(
					{
						code: "REGISTRATION_CLAIM_INVALID",
						message: "This registration link has expired.",
					},
					{ status: 403 },
				);
			}),
		);
		renderAuth("/auth/register");
		expect((await screen.findByRole("alert")).textContent).toContain("expired");
		expect(screen.queryByLabelText("Password")).toBeNull();
	});
});
