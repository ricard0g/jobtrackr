import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import App from "@/App";
import { login } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-config";
import { ACCOUNT_SETTINGS_PATH } from "@/lib/account-settings";
import { appAction, appLoader, appShouldRevalidate } from "@/routes/app-data";
import { accountSettingsAction, accountSettingsLoader } from "@/routes/account-settings-data";
import { AccountSettingsFallbackRoute } from "@/routes/AccountSettingsRoute";
import { loginAction, publicAuthLoader, registerAction } from "@/routes/auth-data";
import { LoginPage, RegisterPage } from "@/routes/auth";
import { mswServer, startMsw } from "@/test/msw";
import type { SignInMethods } from "@/types/sign-in-methods";

startMsw();

afterEach(() => {
	cleanup();
	window.sessionStorage.clear();
});

const demoCredentials = {
	email: "demo@jobtrackr.local",
	password: "password123",
};

async function authenticateDemoUser() {
	await login(demoCredentials);
}

function renderApp(initialEntries: string[]) {
	const router = createMemoryRouter(
		[
			{
				path: "/auth/login",
				Component: LoginPage,
				loader: publicAuthLoader,
				action: loginAction,
			},
			{
				path: "/auth/register",
				Component: RegisterPage,
				loader: publicAuthLoader,
				action: registerAction,
			},
			{
				id: "app",
				path: "/",
				Component: App,
				loader: appLoader,
				action: appAction,
				shouldRevalidate: appShouldRevalidate,
				HydrateFallback: () => null,
				children: [
					{ index: true, element: <div>Kanban page</div> },
					{ path: "documents", element: <div>Documents page</div> },
					{
						id: "account-settings",
						path: "settings/account",
						Component: AccountSettingsFallbackRoute,
						loader: accountSettingsLoader,
						action: accountSettingsAction,
					},
				],
			},
		],
		{ initialEntries },
	);

	render(<RouterProvider router={router} />);
	return router;
}

async function openAccountSettings() {
	fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
	fireEvent.click(screen.getByRole("link", { name: "Settings" }));
	return screen.findByRole("dialog", { name: "Account Settings" });
}

describe("Account Settings routed dialog", () => {
	it("opens from Kanban with a masked canonical path and restores Kanban on close", async () => {
		await authenticateDemoUser();
		const router = renderApp(["/"]);

		expect(await screen.findByText("Kanban page")).toBeTruthy();
		const dialog = await openAccountSettings();

		expect(screen.getByText("Kanban page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/");
		expect(router.state.location.mask?.pathname).toBe(ACCOUNT_SETTINGS_PATH);

		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Account Settings" })).toBeNull();
		});
		expect(screen.getByText("Kanban page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/");
		expect(router.state.location.mask).toBeUndefined();
	});

	it("opens from Documents and restores the Documents location on close", async () => {
		await authenticateDemoUser();
		const router = renderApp(["/documents?view=base"]);

		expect(await screen.findByText("Documents page")).toBeTruthy();
		const dialog = await openAccountSettings();

		expect(screen.getByText("Documents page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/documents");
		expect(router.state.location.search).toBe("?view=base");
		expect(router.state.location.mask?.pathname).toBe(ACCOUNT_SETTINGS_PATH);

		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Account Settings" })).toBeNull();
		});
		expect(screen.getByText("Documents page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/documents");
		expect(router.state.location.search).toBe("?view=base");
	});

	it("renders the same dialog over a lightweight shell on a direct visit and closes to the root", async () => {
		await authenticateDemoUser();
		const router = renderApp([ACCOUNT_SETTINGS_PATH]);

		const dialog = await screen.findByRole("dialog", { name: "Account Settings" });
		expect(screen.queryByText("Kanban page")).toBeNull();
		expect(screen.queryByText("Documents page")).toBeNull();
		expect(router.state.location.pathname).toBe(ACCOUNT_SETTINGS_PATH);

		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Account Settings" })).toBeNull();
		});
		expect(await screen.findByText("Kanban page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/");
	});

	it("returns an unauthenticated visitor to Account Settings after login", async () => {
		const router = renderApp([ACCOUNT_SETTINGS_PATH]);

		expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
		expect(router.state.location.pathname).toBe("/auth/login");
		expect(router.state.location.search).toBe(`?returnTo=${encodeURIComponent(ACCOUNT_SETTINGS_PATH)}`);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: demoCredentials.email },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: demoCredentials.password },
		});
		fireEvent.click(screen.getByRole("button", { name: "Log in" }));

		expect(await screen.findByRole("dialog", { name: "Account Settings" })).toBeTruthy();
		expect(router.state.location.pathname).toBe(ACCOUNT_SETTINGS_PATH);
	});

	it("ignores an unsafe return destination after login", async () => {
		const router = renderApp([`/auth/login?returnTo=${encodeURIComponent("https://evil.example")}`]);

		expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: demoCredentials.email },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: demoCredentials.password },
		});
		fireEvent.click(screen.getByRole("button", { name: "Log in" }));

		expect(await screen.findByText("Kanban page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/");
	});

	it("saves a trimmed display name through PATCH /user and keeps Primary Email read-only", async () => {
		await authenticateDemoUser();
		renderApp(["/"]);

		await screen.findByText("Kanban page");
		await openAccountSettings();

		const dialog = screen.getByRole("dialog", { name: "Account Settings" });
		const displayName = within(dialog).getByLabelText("Display name");
		const primaryEmail = within(dialog).getByLabelText("Primary Email");

		expect((primaryEmail as HTMLInputElement).readOnly).toBe(true);
		expect((primaryEmail as HTMLInputElement).value).toBe("demo@jobtrackr.local");
		expect(within(dialog).queryByRole("button", { name: "Log out" })).toBeNull();

		fireEvent.change(displayName, { target: { value: "  Ada Lovelace  " } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect((displayName as HTMLInputElement).value).toBe("Ada Lovelace");
		});
		fireEvent.click(screen.getByRole("button", { name: "Open account menu", hidden: true }));
		expect(screen.getByText("Ada Lovelace")).toBeTruthy();
	});

	it("warns before closing dirty Profile changes and keeps the dialog open on cancel", async () => {
		await authenticateDemoUser();
		renderApp(["/"]);

		await screen.findByText("Kanban page");
		const dialog = await openAccountSettings();
		fireEvent.change(within(dialog).getByLabelText("Display name"), {
			target: { value: "Changed name" },
		});
		fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

		const confirm = await screen.findByRole("alertdialog", {
			name: "Discard unsaved Profile changes?",
		});
		fireEvent.click(within(confirm).getByRole("button", { name: "Keep editing" }));

		expect(screen.getByRole("dialog", { name: "Account Settings" })).toBeTruthy();
		expect((within(dialog).getByLabelText("Display name") as HTMLInputElement).value).toBe(
			"Changed name",
		);
	});

	it("warns before navigating away from dirty Profile changes", async () => {
		await authenticateDemoUser();
		const router = renderApp(["/"]);

		await screen.findByText("Kanban page");
		const dialog = await openAccountSettings();
		fireEvent.change(within(dialog).getByLabelText("Display name"), {
			target: { value: "Changed name" },
		});
		fireEvent.click(screen.getByRole("link", { name: "Documents", hidden: true }));

		const confirm = await screen.findByRole("alertdialog", {
			name: "Discard unsaved Profile changes?",
		});
		fireEvent.click(within(confirm).getByRole("button", { name: "Discard" }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Account Settings" })).toBeNull();
		});
		expect(await screen.findByText("Documents page")).toBeTruthy();
		expect(router.state.location.pathname).toBe("/documents");
	});

	it("keeps a single right-side logout control and puts Settings in the account menu", async () => {
		await authenticateDemoUser();
		renderApp(["/"]);

		await screen.findByText("Kanban page");
		expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
		expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
		expect(screen.getByText("Demo User")).toBeTruthy();
		expect(screen.getByText("demo@jobtrackr.local")).toBeTruthy();
		expect(screen.getAllByRole("button", { name: "Log out" })).toHaveLength(1);
	});
});

const passwordChangedAt = "2026-03-04T15:30:00.000Z";
const googleLinkedAt = "2026-01-15T10:00:00.000Z";
const googleLastUsedAt = "2026-02-20T08:45:00.000Z";
const googleSubject = "google-subject-should-never-leak";

function passwordOnlyMethods(overrides: Partial<SignInMethods["password"]> = {}): SignInMethods {
	return {
		password: { enabled: true, changedAt: null, ...overrides },
		google: {
			connected: false,
			providerEmail: null,
			linkedAt: null,
			lastUsedAt: null,
		},
	};
}

function googleOnlyMethods(providerEmail = "google-only@example.com"): SignInMethods {
	return {
		password: { enabled: false, changedAt: null },
		google: {
			connected: true,
			providerEmail,
			linkedAt: googleLinkedAt,
			lastUsedAt: googleLastUsedAt,
		},
	};
}

function bothMethods(providerEmail = "linked-google@example.com"): SignInMethods {
	return {
		password: { enabled: true, changedAt: passwordChangedAt },
		google: {
			connected: true,
			providerEmail,
			linkedAt: googleLinkedAt,
			lastUsedAt: googleLastUsedAt,
		},
	};
}

function stubSignInMethods(methods: SignInMethods) {
	mswServer.use(
		http.get(`${API_BASE_URL}/user/sign-in-methods`, () => {
			return HttpResponse.json(methods);
		}),
	);
}

async function openSignInMethods() {
	await authenticateDemoUser();
	renderApp(["/"]);
	await screen.findByText("Kanban page");
	const dialog = await openAccountSettings();
	expect(await within(dialog).findByRole("heading", { name: "Sign-in Methods" })).toBeTruthy();
	await waitFor(() => {
		const loaded =
			within(dialog).queryByRole("button", { name: "Change" }) ||
			within(dialog).queryByRole("button", { name: "Create" }) ||
			within(dialog).queryByRole("button", { name: "Connect" });
		expect(loaded).toBeTruthy();
	});
	return dialog;
}

describe("Account Settings Sign-in Methods", () => {
	it("shows Change and Connect for a password-only User and omits empty timestamps", async () => {
		stubSignInMethods(passwordOnlyMethods());
		const dialog = await openSignInMethods();

		expect(within(dialog).getByRole("button", { name: "Change" })).toBeTruthy();
		expect(within(dialog).queryByRole("button", { name: "Create" })).toBeNull();
		expect(within(dialog).getByRole("button", { name: "Connect" })).toBeTruthy();
		expect(within(dialog).queryByRole("button", { name: "Disconnect" })).toBeNull();
		expect(within(dialog).queryByText(/Changed/)).toBeNull();
		expect(within(dialog).queryByText(/Last used/)).toBeNull();
		expect(dialog.textContent).not.toContain(googleSubject);
	});

	it("shows password changedAt when the timestamp has a value", async () => {
		stubSignInMethods(passwordOnlyMethods({ changedAt: passwordChangedAt }));
		const dialog = await openSignInMethods();

		expect(within(dialog).getByText(/Changed/)).toBeTruthy();
		expect(within(dialog).getByText(/Mar 4, 2026/)).toBeTruthy();
	});

	it("shows Create and a disabled Disconnect when Google is the only method", async () => {
		stubSignInMethods(googleOnlyMethods("google-only@example.com"));
		const dialog = await openSignInMethods();

		expect(within(dialog).getByRole("button", { name: "Create" })).toBeTruthy();
		expect(within(dialog).queryByRole("button", { name: "Change" })).toBeNull();
		expect(within(dialog).queryByRole("button", { name: "Connect" })).toBeNull();
		const disconnect = within(dialog).getByRole("button", { name: "Disconnect" });
		expect((disconnect as HTMLButtonElement).disabled).toBe(true);
		expect(within(dialog).getByText("Create a password before disconnecting Google.")).toBeTruthy();
		expect(within(dialog).getByRole("button", { name: "Create password" })).toBeTruthy();
		expect(within(dialog).getByText("google-only@example.com")).toBeTruthy();
		expect(within(dialog).getByText("Connected")).toBeTruthy();
		expect(within(dialog).getByText(/Linked/)).toBeTruthy();
		expect(within(dialog).getByText(/Last used/)).toBeTruthy();
	});

	it("shows Google connection details and an enabled Disconnect when both methods exist", async () => {
		stubSignInMethods(bothMethods("linked-google@example.com"));
		const dialog = await openSignInMethods();

		expect(within(dialog).getByRole("button", { name: "Change" })).toBeTruthy();
		expect(within(dialog).getByText("linked-google@example.com")).toBeTruthy();
		const disconnect = within(dialog).getByRole("button", { name: "Disconnect" });
		expect((disconnect as HTMLButtonElement).disabled).toBe(false);
		expect(within(dialog).queryByText("Create a password before disconnecting Google.")).toBeNull();
	});

	it("keeps differing provider email and Primary Email visible with a neutral explanation", async () => {
		stubSignInMethods(bothMethods("other-google@example.com"));
		const dialog = await openSignInMethods();

		expect(within(dialog).getByLabelText("Primary Email")).toHaveProperty(
			"value",
			"demo@jobtrackr.local",
		);
		expect(within(dialog).getByText("other-google@example.com")).toBeTruthy();
		expect(
			within(dialog).getByText(
				"The Google email differs from your Primary Email. Primary Email is unchanged.",
			),
		).toBeTruthy();
		expect(dialog.textContent).not.toContain(googleSubject);
	});

	it("does not explain matching provider and Primary Email", async () => {
		stubSignInMethods(bothMethods("demo@jobtrackr.local"));
		const dialog = await openSignInMethods();

		expect(within(dialog).getByText("demo@jobtrackr.local")).toBeTruthy();
		expect(
			within(dialog).queryByText(
				"The Google email differs from your Primary Email. Primary Email is unchanged.",
			),
		).toBeNull();
	});

	it("omits Google subject and token fields from the MSW sign-in methods response", async () => {
		await authenticateDemoUser();
		const { loadState, saveState } = await import("@/mocks/db");
		const state = loadState();
		const userId = state.users[0]?.userId;
		state.googleIdentities = [
			{
				userId,
				subject: googleSubject,
				providerEmail: "seed-google@example.com",
				linkedAt: googleLinkedAt,
				lastUsedAt: googleLastUsedAt,
			},
		];
		saveState(state);

		const { api } = await import("@/lib/api");
		const methods = await api.getSignInMethods();
		const serialized = JSON.stringify(methods);
		expect(methods.google.connected).toBe(true);
		expect(methods.google).not.toHaveProperty("subject");
		expect(methods.google).not.toHaveProperty("accessToken");
		expect(methods.google).not.toHaveProperty("idToken");
		expect(serialized).not.toContain(googleSubject);

		const dialog = await openSignInMethods();
		expect(within(dialog).getByText("seed-google@example.com")).toBeTruthy();
		expect(dialog.textContent).not.toContain(googleSubject);
	});

	it("revalidates Sign-in Methods after a recognized OAuth result code", async () => {
		let signInMethodReads = 0;
		mswServer.use(
			http.get(`${API_BASE_URL}/user/sign-in-methods`, () => {
				signInMethodReads += 1;
				return HttpResponse.json(
					passwordOnlyMethods({
						changedAt: signInMethodReads > 1 ? passwordChangedAt : null,
					}),
				);
			}),
		);

		await authenticateDemoUser();
		const router = renderApp(["/"]);
		await screen.findByText("Kanban page");
		const firstDialog = await openAccountSettings();
		expect(await within(firstDialog).findByRole("button", { name: "Connect" })).toBeTruthy();
		expect(within(firstDialog).queryByText(/Changed/)).toBeNull();
		fireEvent.keyDown(firstDialog, { key: "Escape", code: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Account Settings" })).toBeNull();
		});

		const readsBeforeReturn = signInMethodReads;
		await router.navigate(`${ACCOUNT_SETTINGS_PATH}?oauthResult=failed`);

		const dialog = await screen.findByRole("dialog", { name: "Account Settings" });
		expect(await within(dialog).findByText(/Changed/)).toBeTruthy();
		expect(within(dialog).getByRole("status").textContent).toContain("Google sign-in failed");
		expect(signInMethodReads).toBeGreaterThan(readsBeforeReturn);
		await waitFor(() => {
			expect(router.state.location.search).not.toContain("oauthResult");
		});
	});
});
