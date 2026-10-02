import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";

vi.hoisted(() => {
	HTMLElement.prototype.scrollIntoView = vi.fn();
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
import { applicationDetailAction, applicationDetailLoader, applicationDetailShouldRevalidate } from "@/routes/application-detail-data";
import { DocumentsRoute } from "@/routes/DocumentsRoute";
import { DOCUMENTS_RECENT_ROUTE_ID, documentsLoader, recentGeneratedCvsLoader } from "@/routes/documents-data";
import { applicationGenerateAction, applicationGenerateLoader } from "@/routes/application-generate-data";
import { KanbanRoute } from "@/routes/KanbanRoute";
import { mswServer, startMsw } from "@/test/msw";

vi.mock("react-pdf", () => ({ Document: () => null, Page: () => null, pdfjs: { GlobalWorkerOptions: {}, version: "5" } }));

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
					id: "kanban",
					Component: KanbanRoute,
					loader: kanbanLoader,
					children: [
						{ index: true },
						{
							path: "applications/:applicationId",
							Component: ApplicationDetailRoute,
							loader: applicationDetailLoader,
							action: applicationDetailAction,
							shouldRevalidate: applicationDetailShouldRevalidate,
							children: [
								{ index: true },
								{ id: "application-generate", path: "generate", loader: applicationGenerateLoader, action: applicationGenerateAction },
							],
						},
					],
				},
				{ path: "resources/entitlement", loader: entitlementLoader },
				{ id: DOCUMENTS_RECENT_ROUTE_ID, path: "documents", Component: Outlet, loader: recentGeneratedCvsLoader,
					children: [{ index: true, Component: DocumentsRoute, loader: documentsLoader }] },
			],
		},
	]);
	render(<RouterProvider router={router} />);
	return router;
}

async function waitForPaidAccess() {
	await screen.findByRole("navigation", { name: "Main navigation", hidden: true });
	await waitFor(() => { expect(screen.queryByText("Limited Access")).toBeNull(); });
}

describe("current entitlement in the signed-in app", () => {
    it.each(["upload", "generation"])("updates the %s capability in a live session after failure and recovery", async (capability) => {
        let paid = true;
        mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
            HttpResponse.json({ access: paid ? "PAID" : "LIMITED", canCreateApplications: paid, paidUntil: null }),
        ));
        const router = await renderBoard();
        await waitForPaidAccess();
        const application = (await api.getApplications())[0];
        await act(async () => {
            await router.navigate(capability === "upload" ? "/documents?tab=base" : `/applications/${application.applicationId}/generate`);
        });
        if (capability === "upload") {
            expect((await screen.findByRole("button", { name: "Upload a Base CV" })).getAttribute("aria-disabled")).toBe("false");
        }
        paid = false;
        fireEvent(window, new Event("focus"));
        await screen.findByText("Limited Access");
        expect(await screen.findByText(capability === "upload" ? /Base CV uploads require current paid access/ : /CV Generation requires current paid access/)).toBeTruthy();
        if (capability === "upload") {
            expect(screen.getByRole("button", { name: "Upload a Base CV" }).getAttribute("aria-disabled")).toBe("true");
        }
        paid = true;
        fireEvent(window, new Event("focus"));
        await waitForPaidAccess();
        expect(screen.queryByText(capability === "upload" ? /Base CV uploads require current paid access/ : /CV Generation requires current paid access/)).toBeNull();
    });
	it.each(["expiry", "payment failure"])("keeps existing work usable after %s in the same session", async (reason) => {
		mswServer.use(http.get(`${API_BASE_URL}/cv-generations`, () => HttpResponse.json([])));
		let failed = false;
		let paidUntil = Date.now() + 60_000;
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () => {
			const paid = !failed && Date.now() < paidUntil;
			return HttpResponse.json({
				access: paid ? "PAID" : "LIMITED", canCreateApplications: paid,
				paidUntil: paid ? new Date(paidUntil).toISOString() : null,
			});
		}));
		const router = await renderBoard();
		await waitForPaidAccess();
		const application = (await api.getApplications())[0];
		await act(async () => { await router.navigate(`/applications/${application.applicationId}`); });
		await screen.findByRole("dialog", { name: application.applicationTitle });
		if (reason === "expiry") paidUntil = Date.now();
		else failed = true;
		fireEvent(window, new Event("focus"));
		await screen.findByText("Limited Access");

		fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
		fireEvent.change(await screen.findByDisplayValue(application.applicationTitle), {
			target: { value: "Continuing pursuit" },
		});
		const statusSelect = within(screen.getByRole("dialog")).getAllByRole("combobox")[0];
		fireEvent.keyDown(statusSelect, { key: "ArrowDown", code: "ArrowDown" });
		fireEvent.click(await screen.findByRole("option", { name: "Offer" }));
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
		await screen.findByRole("dialog", { name: "Continuing pursuit" });

		fireEvent.click(await screen.findByRole("button", { name: /^Add$/ }));
		fireEvent.change(screen.getByRole("dialog").querySelector<HTMLInputElement>('input[name="interviewScheduledAt"]')!, { target: { value: "2030-01-09T10:00" } });
		fireEvent.change(screen.getByRole("dialog").querySelector<HTMLTextAreaElement>('textarea[name="interviewNotes"]')!, { target: { value: "Interview for existing pursuit" } });
		fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
		await screen.findByText("Interview for existing pursuit");
		await waitFor(() => { expect(screen.queryByRole("button", { name: /^Create$/ })).toBeNull(); });

		fireEvent.click(screen.getByRole("button", { name: /Edit tags/ }));
		fireEvent.click(await screen.findByRole("option", { name: "Add Tag" }));
		fireEvent.change(await screen.findByRole("textbox", { name: "Tag name" }), { target: { value: "Follow up" } });
		fireEvent.click(await screen.findByRole("button", { name: "Create tag" }));
		const checkbox = await screen.findByRole("checkbox", { name: "Follow up" }, { timeout: 5_000 });
		await waitFor(() => { expect(checkbox.getAttribute("data-state")).toBe("checked"); });
		expect((await api.getApplicationById(application.applicationId)).tags.some((tag) => tag.tagName === "Follow up")).toBe(false);
		fireEvent.click(await screen.findByRole("button", { name: /^Apply$/ }));
		await waitFor(async () => {
			expect((await api.getApplicationById(application.applicationId)).tags.some((tag) => tag.tagName === "Follow up")).toBe(true);
		});
		await waitFor(() => { expect(screen.queryByRole("button", { name: /^Apply$/ })).toBeNull(); });
		fireEvent.keyDown(screen.getByRole("dialog", { name: "Continuing pursuit" }), { key: "Escape", code: "Escape" });
		await waitFor(() => { expect(router.state.location.pathname).toBe("/"); });
		expect(await screen.findByRole("link", { name: /Continuing pursuit/ })).toBeTruthy();
		expect((await api.getApplicationById(application.applicationId)).applicationStatus).toBe("OFFER");

		await act(async () => { await router.navigate("/documents"); });
		const preview = await screen.findByRole("button", { name: /^Preview .* from Recent files$/ });
		mswServer.use(http.get(`${API_BASE_URL}/generated-cvs/:id/preview`, () =>
			new HttpResponse("# Previously Generated CV\n\nSaved candidate work.", { headers: { "Content-Type": "text/markdown" } }),
		));
		fireEvent.click(preview);
		expect(await screen.findByRole("heading", { name: "Previously Generated CV" })).toBeTruthy();
		expect(within(screen.getByRole("dialog")).getByText("Saved candidate work.")).toBeTruthy();
	}, 15_000);

	it("explains Limited Access and disables creation while keeping existing Applications visible", async () => {
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
			HttpResponse.json({ access: "LIMITED", canCreateApplications: false, paidUntil: null }),
		));
		await renderBoard();
		expect(await screen.findByText("Limited Access")).toBeTruthy();
		const badge = screen.getByRole("status", { name: "Limited Access" });
		expect(screen.getByRole("navigation").contains(badge)).toBe(false);
		expect(screen.getByRole("banner").contains(badge)).toBe(true);
		expect(screen.queryByRole("button", { name: "Limited Access" })).toBeNull();
		expect(screen.queryByText(/Your existing Applications remain available/)).toBeNull();
		fireEvent.focus(badge);
		const tooltip = await screen.findByRole("tooltip");
		expect(tooltip.textContent).toContain("add Interviews, create and attach Tags, and preview saved Generated CVs");
		expect(tooltip.textContent).toContain("Creating new Applications, uploading Base CVs, and starting CV Generation require current paid access.");
		for (const button of screen.getAllByRole("button", { name: /Create application in/ })) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
		expect(screen.getAllByRole("link").length).toBeGreaterThan(2);
	});
	it("toggles the Limited Access explanation with touch taps", async () => {
		mswServer.use(http.get(`${API_BASE_URL}/user/entitlement`, () =>
			HttpResponse.json({ access: "LIMITED", canCreateApplications: false, paidUntil: null }),
		));
		await renderBoard();
		const badge = await screen.findByRole("status", { name: "Limited Access" });
		const tapBadge = () => {
			const pointerDown = createEvent.pointerDown(badge);
			Object.defineProperty(pointerDown, "pointerType", { value: "touch" });
			fireEvent(badge, pointerDown);
			fireEvent.pointerUp(badge);
			fireEvent.click(badge);
		};
		tapBadge();
		expect((await screen.findByRole("tooltip")).textContent).toContain("Creating new Applications, uploading Base CVs, and starting CV Generation require current paid access.");
		tapBadge();
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
		tapBadge();
		await screen.findByRole("tooltip");
		fireEvent.keyDown(badge, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
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
		await waitForPaidAccess();
		expect((screen.getAllByRole("button", { name: /Create application in/ })[0] as HTMLButtonElement).disabled).toBe(false);
		paid = false;
		fireEvent(window, new Event("focus"));
		expect(await screen.findByText("Limited Access")).toBeTruthy();
		expect((screen.getAllByRole("button", { name: /Create application in/ })[0] as HTMLButtonElement).disabled).toBe(true);
		paid = true;
		fireEvent(window, new Event("focus"));
		await waitFor(() => {
			expect(screen.queryByText("Limited Access")).toBeNull();
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
		await waitForPaidAccess();
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
		await waitForPaidAccess();
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
		await waitForPaidAccess();
		const application = (await api.getApplications())[0];
		await act(async () => { await router.navigate(`/applications/${application.applicationId}`); });
		await screen.findByRole("dialog", { name: application.applicationTitle });
		if (draft === "Application") {
			fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
			fireEvent.change(await screen.findByDisplayValue(application.applicationTitle), {
				target: { value: "Unsaved application draft" },
			});
		} else {
			fireEvent.click(await screen.findByRole("button", { name: /^Add$/ }));
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
