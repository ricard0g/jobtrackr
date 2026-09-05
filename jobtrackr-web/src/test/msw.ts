import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

import { clearAccessToken } from "@/lib/api";
import { resetState } from "@/mocks/db";
import { handlers } from "@/mocks/handlers";

export const mswServer = setupServer(...handlers);

export function startMsw() {
	beforeAll(() => {
		mswServer.listen({ onUnhandledRequest: "error" });
	});

	afterEach(() => {
		mswServer.resetHandlers();
		resetState();
		clearAccessToken();
		window.localStorage.clear();
	});

	afterAll(() => {
		mswServer.close();
	});
}
