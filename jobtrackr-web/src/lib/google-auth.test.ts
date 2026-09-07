import { describe, expect, it } from "vitest";

import {
	googleAuthorizationHref,
	oauthResultMessage,
	parseOAuthResult,
	sanitizeOauthReturnTo,
} from "@/lib/google-auth";

describe("parseOAuthResult", () => {
	it("accepts only allowlisted callback codes", () => {
		expect(parseOAuthResult("failed")).toBe("failed");
		expect(parseOAuthResult("access_denied")).toBeNull();
		expect(parseOAuthResult("")).toBeNull();
	});
});

describe("googleAuthorizationHref", () => {
	it("adds the register screen and an allowlisted returnTo", () => {
		expect(
			googleAuthorizationHref(
				"register",
				"/settings/account",
				"/api/v1/auth/oauth2/authorization/google",
			),
		).toBe(
			"/api/v1/auth/oauth2/authorization/google?screen=register&returnTo=%2Fsettings%2Faccount",
		);
	});

	it("omits an unsafe returnTo and does not request the account chooser", () => {
		const href = googleAuthorizationHref(
			"login",
			"https://evil.example",
			"/api/v1/auth/oauth2/authorization/google",
		);
		expect(href).toBe("/api/v1/auth/oauth2/authorization/google");
		expect(href).not.toContain("prompt=");
		expect(sanitizeOauthReturnTo("https://evil.example")).toBeNull();
	});
});

describe("oauthResultMessage", () => {
	it("never exposes raw provider errors", () => {
		expect(oauthResultMessage("failed")).toBe(
			"Google sign-in failed. Try again or use your password.",
		);
	});

	it("directs collisions to password sign-in without exposing Google details", () => {
		const message = oauthResultMessage("conflict");
		expect(message).toBe(
			"This Google identity is not linked to your JobTrackr User. Sign in with your password to connect it.",
		);
		expect(message).not.toMatch(/id_token|access_token|@/);
	});
});
