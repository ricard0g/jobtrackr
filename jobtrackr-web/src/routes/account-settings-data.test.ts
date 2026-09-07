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
});
