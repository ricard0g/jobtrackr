import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

vi.hoisted(() => {
	vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
	vi.stubGlobal("matchMedia", vi.fn(() => ({
		matches: false, addListener() {}, removeListener() {},
		addEventListener() {}, removeEventListener() {},
	})));
});

import App from "@/App";
import { api, login } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-config";
import { appLoader, appShouldRevalidate, entitlementLoader, kanbanLoader } from "@/routes/app-data";
import { ApplicationDetailRoute } from "@/routes/ApplicationDetailRoute";
import { applicationDetailLoader } from "@/routes/application-detail-data";
import { applicationGenerateLoader } from "@/routes/application-generate-data";
import { KanbanRoute } from "@/routes/KanbanRoute";
import { mswServer, startMsw } from "@/test/msw";

startMsw();
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

async function renderBoard() {
	await login({ email: "demo@jobtrackr.local", password: "password123" });
	const router = createMemoryRouter([
		{
			id: "app",
			path: "/",
			Component: App,
			loader: appLoader,
			shouldRevalidate: appShouldRevalidate,
			children: [
				{
					Component: KanbanRoute,
					loader: kanbanLoader,
					children: [
						{ index: true },
						{
							path: "applications/:applicationId",
							Component: ApplicationDetailRoute,
							loader: applicationDetailLoader,
							children: [
								{ index: true },
								{ id: "application-generate", path: "generate", loader: applicationGenerateLoader },
							],
						},
					],
				},
				{ path: "resources/entitlement", loader: entitlementLoader },
			],
		},
	]);
	render(<RouterProvider router={router} />);
	return router;
}

describe("current entitlement in the signed-in app", () => {
	it("explains Limited Access and disables creation while keeping existing Applications visible", async () => {
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
			HttpResponse.json({ access: "LIMITED", canCreateApplications: false, paidUntil: null }),
		));
		await renderBoard();
		expect(await screen.findByText("Limited Access")).toBeTruthy();
		expect(screen.getByText(/Your existing Applications remain available/)).toBeTruthy();
		for (const button of screen.getAllByRole("button", { name: /Create application in/ })) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
		expect(screen.getAllByRole("link").length).toBeGreaterThan(2);
	});
	it("refreshes an existing session on focus after payment changes and restores creation after recovery", async () => {
		let paid = true;
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
			HttpResponse.json({
				access: paid ? "PAID" : "LIMITED",
				canCreateApplications: paid,
				paidUntil: paid ? "2100-01-01T00:00:00Z" : null,
			}),
		));
		await renderBoard();
		expect(await screen.findByText("Paid access")).toBeTruthy();
		expect((screen.getAllByRole("button", { name: /Create application in/ })[0] as HTMLButtonElement).disabled).toBe(false);
		paid = false;
		fireEvent(window, new Event("focus"));
		expect(await screen.findByText("Limited Access")).toBeTruthy();
		expect((screen.getAllByRole("button", { name: /Create application in/ })[0] as HTMLButtonElement).disabled).toBe(true);
		paid = true;
		fireEvent(window, new Event("focus"));
		await waitFor(() => {
			expect(screen.getByText("Paid access")).toBeTruthy();
			expect((screen.getAllByRole("button", { name: /Create application in/ })[0] as HTMLButtonElement).disabled).toBe(false);
		});
	});

	it("refreshes when the paid period ends while the User stays on the board", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const until = Date.now() + 5_000;
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () => {
			const paid = Date.now() < until;
			return HttpResponse.json({
				access: paid ? "PAID" : "LIMITED",
				canCreateApplications: paid,
				paidUntil: paid ? new Date(until).toISOString() : null,
			});
		}));
		await renderBoard();
		expect(await screen.findByText("Paid access")).toBeTruthy();
		await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
		expect(await screen.findByText("Limited Access")).toBeTruthy();
		for (const button of screen.getAllByRole("button", { name: /Create application in/ })) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
	});

	it("polls for payment changes without requiring navigation or another sign-in", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let paid = true;
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
			HttpResponse.json({
				access: paid ? "PAID" : "LIMITED", canCreateApplications: paid,
				paidUntil: paid ? "2100-01-01T00:00:00Z" : null,
			}),
		));
		await renderBoard();
		expect(await screen.findByText("Paid access")).toBeTruthy();
		paid = false;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(await screen.findByText("Limited Access")).toBeTruthy();
	});

	it.each(["Application", "Interview"])("preserves an unsaved %s draft during entitlement refresh", async (draft) => {
		let paid = true;
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
			HttpResponse.json({
				access: paid ? "PAID" : "LIMITED", canCreateApplications: paid,
				paidUntil: paid ? "2100-01-01T00:00:00Z" : null,
			}),
		));
		const router = await renderBoard();
		await screen.findByText("Paid access");
		const application = (await api.getApplications())[0];
		await act(async () => { await router.navigate(`/applications/${application.applicationId}`); });
		await screen.findByRole("dialog", { name: application.applicationTitle });
		if (draft === "Application") {
			fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
			fireEvent.change(await screen.findByDisplayValue(application.applicationTitle), {
				target: { value: "Unsaved application draft" },
			});
		} else {
			fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
			const notes = screen.getAllByRole("textbox").find((field) => field.getAttribute("name") === "interviewNotes");
			expect(notes).toBeTruthy();
			fireEvent.change(notes!, { target: { value: "Unsaved interview draft" } });
		}
		paid = false;
		fireEvent(window, new Event("focus"));
		await screen.findByText("Limited Access");
		expect(screen.getByDisplayValue(`Unsaved ${draft.toLowerCase()} draft`)).toBeTruthy();
	});

});
