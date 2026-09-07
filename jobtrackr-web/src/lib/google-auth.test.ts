import { describe, expect, it } from "vitest";

import {
	consumeOAuthResultParam,
	googleAuthorizationHref,
	googleLinkAuthorizationHref,
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

	it("describes an identity mismatch without exposing Google details", () => {
		const message = oauthResultMessage("mismatch");
		expect(message).toBe("That Google identity does not match your Primary Email.");
		expect(message).not.toMatch(/id_token|access_token|sub=/);
	});
});

describe("googleLinkAuthorizationHref", () => {
	it("returns to Account Settings without requesting the account chooser in the URL", () => {
		const href = googleLinkAuthorizationHref("/api/v1/auth/oauth2/authorization/google");
		expect(href).toBe(
			"/api/v1/auth/oauth2/authorization/google?returnTo=%2Fsettings%2Faccount",
		);
		expect(href).not.toContain("prompt=");
	});
});

describe("consumeOAuthResultParam", () => {
	it("flashes an allowlisted code and then returns it on the cleaned URL", () => {
		window.sessionStorage.clear();
		const incoming = consumeOAuthResultParam(
			new URL("http://localhost/settings/account?oauthResult=failed"),
		);
		expect(incoming.redirectHref).toBe("/settings/account");
		expect(incoming.result).toBeNull();

		const flashed = consumeOAuthResultParam(new URL("http://localhost/settings/account"));
		expect(flashed.redirectHref).toBeNull();
		expect(flashed.result).toBe("failed");
		expect(window.sessionStorage.getItem("jobtrackr.oauthResult")).toBeNull();
	});
});
