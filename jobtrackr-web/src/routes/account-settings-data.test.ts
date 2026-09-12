import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";

import { api, ApiError, clearAccessToken, setAccessToken } from "@/lib/api";
import { AUTH_BASE_URL } from "@/lib/api-config";
import { ACCOUNT_SETTINGS_PATH } from "@/lib/account-settings";
import { accountSettingsAction } from "@/routes/account-settings-data";

afterEach(() => {
	clearAccessToken();
	vi.restoreAllMocks();
});

function createFormData(fields: Record<string, string>) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		formData.set(key, value);
	}
	return formData;
}

function actionArgs(formData: FormData): ActionFunctionArgs {
	return {
		params: {},
		request: new Request(`http://localhost${ACCOUNT_SETTINGS_PATH}`, {
			method: "POST",
			body: formData,
		}),
		context: {},
	} as unknown as ActionFunctionArgs;
}

describe("accountSettingsAction", () => {
	it("saves Profile display name", async () => {
		setAccessToken("test-token");
		const patchUser = vi.spyOn(api, "patchUser").mockResolvedValue({
			userId: "11111111-1111-1111-1111-111111111111",
			userEmail: "demo@jobtrackr.local",
			userDisplayName: "Ada Lovelace",
			userPictureUrl: null,
			userEnabled: true,
			userLocked: false,
			userDeletedAt: null,
			userPasswordChangedAt: "2026-06-04T12:00:00.000Z",
			userLastLoginAt: "2026-06-04T12:00:00.000Z",
			userCreatedAt: "2026-06-04T12:00:00.000Z",
			userUpdatedAt: "2026-09-07T12:00:00.000Z",
		});

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "profile",
					displayName: "  Ada Lovelace  ",
				}),
			),
		);

		expect(result).toEqual({ ok: true, intent: "profile" });
		expect(patchUser).toHaveBeenCalledWith({ displayName: "Ada Lovelace" });
	});

	it("creates a Google link intent and returns the authorization href", async () => {
		setAccessToken("test-token");
		const createGoogleLinkIntent = vi
			.spyOn(api, "createGoogleLinkIntent")
			.mockResolvedValue(undefined);

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "google-link",
					currentPassword: "password123",
				}),
			),
		);

		expect(result).toEqual({
			ok: true,
			intent: "google-link",
			googleAuthorizationHref: `${AUTH_BASE_URL}/oauth2/authorization/google?returnTo=${encodeURIComponent(ACCOUNT_SETTINGS_PATH)}`,
		});
		expect(createGoogleLinkIntent).toHaveBeenCalledWith("password123");
	});

	it("maps an incorrect current password to a field error", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "createGoogleLinkIntent").mockRejectedValue(
			new ApiError("Invalid email or password", 401, "INVALID_CREDENTIALS"),
		);

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "google-link",
					currentPassword: "wrong-password",
				}),
			),
		);

		expect(result).toEqual({
			ok: false,
			intent: "google-link",
			fieldErrors: {
				currentPassword: "Current password is incorrect.",
			},
		});
	});

	it("rejects a confirmation mismatch without calling the password API", async () => {
		setAccessToken("test-token");
		const changePassword = vi.spyOn(api, "changePassword");

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "change-password",
					currentPassword: "password123",
					newPassword: "new-password-456",
					confirmPassword: "does-not-match",
				}),
			),
		);

		expect(result).toEqual({
			ok: false,
			intent: "change-password",
			fieldErrors: {
				confirmPassword: "New password and confirmation must match.",
			},
		});
		expect(changePassword).not.toHaveBeenCalled();
	});

	it("submits current and new password without confirmation", async () => {
		setAccessToken("test-token");
		const changePassword = vi.spyOn(api, "changePassword").mockResolvedValue({
			accessToken: "fresh-access-token",
			tokenType: "Bearer",
			expiresIn: 900,
			user: {
				userId: "11111111-1111-1111-1111-111111111111",
				userEmail: "demo@jobtrackr.local",
				userDisplayName: "Demo User",
				userPictureUrl: null,
				userEnabled: true,
				userLocked: false,
				userDeletedAt: null,
				userPasswordChangedAt: "2026-09-07T21:00:00.000Z",
				userLastLoginAt: "2026-06-04T12:00:00.000Z",
				userCreatedAt: "2026-06-04T12:00:00.000Z",
				userUpdatedAt: "2026-09-07T21:00:00.000Z",
			},
		});

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "change-password",
					currentPassword: "password123",
					newPassword: "new-password-456",
					confirmPassword: "new-password-456",
				}),
			),
		);

		expect(result).toEqual({ ok: true, intent: "change-password" });
		expect(changePassword).toHaveBeenCalledWith({
			currentPassword: "password123",
			newPassword: "new-password-456",
		});
	});

	it("starts Google password reauth without a current password", async () => {
		setAccessToken("test-token");
		const createGooglePasswordReauthIntent = vi
			.spyOn(api, "createGooglePasswordReauthIntent")
			.mockResolvedValue(undefined);

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "google-reauth",
				}),
			),
		);

		expect(result).toEqual({
			ok: true,
			intent: "google-reauth",
			googleAuthorizationHref: `${AUTH_BASE_URL}/oauth2/authorization/google?returnTo=${encodeURIComponent(ACCOUNT_SETTINGS_PATH)}`,
		});
		expect(createGooglePasswordReauthIntent).toHaveBeenCalledTimes(1);
	});

	it("creates a password without sending currentPassword", async () => {
		setAccessToken("test-token");
		const changePassword = vi.spyOn(api, "changePassword").mockResolvedValue({
			accessToken: "fresh-access-token",
			tokenType: "Bearer",
			expiresIn: 900,
			user: {
				userId: "11111111-1111-1111-1111-111111111111",
				userEmail: "demo@jobtrackr.local",
				userDisplayName: "Demo User",
				userPictureUrl: null,
				userEnabled: true,
				userLocked: false,
				userDeletedAt: null,
				userPasswordChangedAt: "2026-09-08T12:00:00.000Z",
				userLastLoginAt: "2026-06-04T12:00:00.000Z",
				userCreatedAt: "2026-06-04T12:00:00.000Z",
				userUpdatedAt: "2026-09-08T12:00:00.000Z",
			},
		});

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "create-password",
					newPassword: "new-password-456",
					confirmPassword: "new-password-456",
				}),
			),
		);

		expect(result).toEqual({ ok: true, intent: "create-password" });
		expect(changePassword).toHaveBeenCalledWith({
			newPassword: "new-password-456",
		});
	});

	it("maps an incorrect current password on change to a field error", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "changePassword").mockRejectedValue(
			new ApiError("Invalid email or password", 401, "INVALID_CREDENTIALS"),
		);

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "change-password",
					currentPassword: "wrong-password",
					newPassword: "new-password-456",
					confirmPassword: "new-password-456",
				}),
			),
		);

		expect(result).toEqual({
			ok: false,
			intent: "change-password",
			fieldErrors: {
				currentPassword: "Current password is incorrect.",
			},
		});
	});

	it("disconnects Google after current-password confirmation", async () => {
		setAccessToken("test-token");
		const disconnectGoogle = vi.spyOn(api, "disconnectGoogle").mockResolvedValue({
			accessToken: "fresh-access-token",
			tokenType: "Bearer",
			expiresIn: 900,
			user: {
				userId: "11111111-1111-1111-1111-111111111111",
				userEmail: "demo@jobtrackr.local",
				userDisplayName: "Demo User",
				userPictureUrl: null,
				userEnabled: true,
				userLocked: false,
				userDeletedAt: null,
				userPasswordChangedAt: "2026-06-04T12:00:00.000Z",
				userLastLoginAt: "2026-06-04T12:00:00.000Z",
				userCreatedAt: "2026-06-04T12:00:00.000Z",
				userUpdatedAt: "2026-09-08T20:00:00.000Z",
			},
		});

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "google-disconnect",
					currentPassword: "password123",
				}),
			),
		);

		expect(result).toEqual({ ok: true, intent: "google-disconnect" });
		expect(disconnectGoogle).toHaveBeenCalledWith("password123");
	});

	it("maps an incorrect disconnect password to a field error", async () => {
		setAccessToken("test-token");
		vi.spyOn(api, "disconnectGoogle").mockRejectedValue(
			new ApiError("Invalid email or password", 401, "INVALID_CREDENTIALS"),
		);

		const result = await accountSettingsAction(
			actionArgs(
				createFormData({
					intent: "google-disconnect",
					currentPassword: "wrong-password",
				}),
			),
		);

		expect(result).toEqual({
			ok: false,
			intent: "google-disconnect",
			fieldErrors: {
				currentPassword: "Current password is incorrect.",
			},
		});
	});
});
