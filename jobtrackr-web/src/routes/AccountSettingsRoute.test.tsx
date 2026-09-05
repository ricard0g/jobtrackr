import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import App from "@/App";
import { login } from "@/lib/api";
import { ACCOUNT_SETTINGS_PATH } from "@/lib/account-settings";
import { appAction, appLoader, appShouldRevalidate } from "@/routes/app-data";
import { accountSettingsAction } from "@/routes/account-settings-data";
import { AccountSettingsFallbackRoute } from "@/routes/AccountSettingsRoute";
import { loginAction, publicAuthLoader, registerAction } from "@/routes/auth-data";
import { LoginPage, RegisterPage } from "@/routes/auth";
import { startMsw } from "@/test/msw";

startMsw();

afterEach(() => {
	cleanup();
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
						path: "settings/account",
						Component: AccountSettingsFallbackRoute,
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
