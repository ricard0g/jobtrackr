import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AUTH_BASE_URL } from "@/lib/api-config";
import * as googleAuth from "@/lib/google-auth";
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
	vi.restoreAllMocks();
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

	it.each(["expired", "already used", "no longer paid"])("explains a link that is %s without offering a password form", async (reason) => {
		window.sessionStorage.setItem(
			"jobtrackr-registration-token",
			"expired-link",
		);
		mswServer.use(
			http.get(`${AUTH_BASE_URL}/registration/verification`, () => {
				return HttpResponse.json(
					{
						code: "REGISTRATION_CLAIM_INVALID",
						message: `This registration link is ${reason}.`,
					},
					{ status: 403 },
				);
			}),
		);
		renderAuth("/auth/register");
		expect((await screen.findByRole("alert")).textContent).toContain(reason);
		expect(screen.queryByLabelText("Password")).toBeNull();
		expect(
			screen.getByRole("link", { name: "View the weekly subscription" }).getAttribute("href"),
		).toBe("https://jobtrakcr.com/#pricing-section");
		expect(screen.getByText(/If your paid week has ended, buy again/)).toBeTruthy();
	});
});

describe("paid Google registration", () => {
	function stubClaim(email = "checkout@example.com") {
		mswServer.use(
			http.get(`${AUTH_BASE_URL}/registration/claim`, ({ request }) => {
				expect(request.headers.get("X-Checkout-Token")).toBe("checkout-token");
				return HttpResponse.json({ email, paidUntil: "2099-10-08T00:00:00Z" });
			}),
		);
	}

	it("starts Google registration from the payment return without offering a password form", async () => {
		enableGoogle();
		stubClaim();
		window.sessionStorage.setItem(
			"jobtrackr-registration-checkout-token",
			"checkout-token",
		);
		let intentHeaders: Headers | undefined;
		mswServer.use(
			http.post(`${AUTH_BASE_URL}/registration/google`, ({ request }) => {
				intentHeaders = request.headers;
				return new HttpResponse(null, { status: 204 });
			}),
		);
		const redirect = vi
			.spyOn(googleAuth, "redirectToGoogleAuthorization")
			.mockImplementation(() => undefined);
		renderAuth("/auth/register");

		await screen.findByText(/Registering checkout@example\.com/);
		expect(screen.queryByLabelText("Password")).toBeNull();
		fireEvent.click(
			screen.getByRole("button", { name: "Continue with Google" }),
		);

		await waitFor(() => {
			expect(redirect).toHaveBeenCalledWith(
				`${AUTH_BASE_URL}/oauth2/authorization/google?screen=register`,
			);
		});
		expect(intentHeaders?.get("X-Checkout-Token")).toBe("checkout-token");
		expect(intentHeaders?.get("X-XSRF-TOKEN")).toBe("mock-csrf-token");
	});

	it("offers Google alongside the password form after the email link", async () => {
		enableGoogle();
		window.sessionStorage.setItem(
			"jobtrackr-registration-token",
			"verified-link",
		);
		let verificationHeader: string | null = null;
		mswServer.use(
			http.get(`${AUTH_BASE_URL}/registration/verification`, () => {
				return HttpResponse.json({
					email: "checkout@example.com",
					paidUntil: "2099-10-08T00:00:00Z",
				});
			}),
			http.post(`${AUTH_BASE_URL}/registration/google`, ({ request }) => {
				verificationHeader = request.headers.get("X-Verification-Token");
				return new HttpResponse(null, { status: 204 });
			}),
		);
		const redirect = vi
			.spyOn(googleAuth, "redirectToGoogleAuthorization")
			.mockImplementation(() => undefined);
		renderAuth("/auth/register");

		await screen.findByLabelText("Password");
		fireEvent.click(
			screen.getByRole("button", { name: "Continue with Google" }),
		);

		await waitFor(() => expect(redirect).toHaveBeenCalled());
		expect(verificationHeader).toBe("verified-link");
	});

	it("explains a Google email mismatch and lets the Buyer try another Google account", async () => {
		enableGoogle();
		stubClaim();
		window.sessionStorage.setItem(
			"jobtrackr-registration-checkout-token",
			"checkout-token",
		);
		renderAuth("/auth/register?oauthResult=mismatch");

		expect(
			(await screen.findByText(/does not match your Checkout Email/))
				.textContent,
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Continue with Google" }),
		).toBeTruthy();
	});

	it("explains a used or expired purchase after a Google callback", async () => {
		enableGoogle();
		window.sessionStorage.setItem(
			"jobtrackr-registration-checkout-token",
			"checkout-token",
		);
		mswServer.use(
			http.get(`${AUTH_BASE_URL}/registration/claim`, () => {
				return HttpResponse.json(
					{
						code: "REGISTRATION_CLAIM_INVALID",
						message:
							"This registration link is invalid, already used, or no longer paid.",
					},
					{ status: 403 },
				);
			}),
		);
		renderAuth("/auth/register?oauthResult=registration_expired");

		await screen.findByText(/paid week has ended or payment is no longer current/);
		expect(screen.getByRole("alert").textContent).toContain("already used");
		expect(
			screen.queryByRole("button", { name: "Continue with Google" }),
		).toBeNull();
	});

	it("shows why Google registration could not start", async () => {
		enableGoogle();
		stubClaim();
		window.sessionStorage.setItem(
			"jobtrackr-registration-checkout-token",
			"checkout-token",
		);
		mswServer.use(
			http.post(`${AUTH_BASE_URL}/registration/google`, () => {
				return HttpResponse.json(
					{
						code: "REGISTRATION_CLAIM_INVALID",
						message: "This purchase is no longer paid.",
					},
					{ status: 403 },
				);
			}),
		);
		const redirect = vi
			.spyOn(googleAuth, "redirectToGoogleAuthorization")
			.mockImplementation(() => undefined);
		renderAuth("/auth/register");

		fireEvent.click(
			await screen.findByRole("button", { name: "Continue with Google" }),
		);

		expect((await screen.findByRole("alert")).textContent).toBe(
			"This purchase is no longer paid.",
		);
		expect(redirect).not.toHaveBeenCalled();
	});

	it("tells an unknown Google identity to buy access before signing in", async () => {
		renderAuth("/auth/login?oauthResult=not_registered");

		await screen.findByText(/No JobTrackr User uses this Google account/);
	});
});

describe("registration recovery", () => {
	it.each(["buyer@example.com", "unknown@example.com"])(
		"shows the same acknowledgement for %s",
		async (email) => {
			let submitted: unknown;
			mswServer.use(
				http.post(`${AUTH_BASE_URL}/registration/recovery`, async ({ request }) => {
					submitted = await request.json();
					return HttpResponse.json(
						{
							message: "If an unclaimed paid purchase is eligible, a registration link will be sent to its Checkout Email.",
						},
						{ status: 202 },
					);
				}),
			);
			renderAuth("/auth/register");
			fireEvent.change(await screen.findByLabelText("Checkout Email"), {
				target: { value: email },
			});
			fireEvent.click(screen.getByRole("button", { name: "Send my registration link" }));
			await screen.findByText(/If an unclaimed paid purchase is eligible/);
			expect(submitted).toEqual({ email });
			expect(screen.queryByLabelText("Password")).toBeNull();
		},
	);
});
