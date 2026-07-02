import { HttpResponse } from "msw";

import type { ErrorBody, ErrorField } from "@/mocks/types";

export const errorJson = (
	status: number,
	code: string,
	message: string,
	fieldErrors: ErrorField[] | null = null,
) =>
	HttpResponse.json<ErrorBody>(
		{ code, message, fieldErrors },
		{ status },
	);

export const validationError = (fieldErrors: ErrorField[]) =>
	errorJson(400, "VALIDATION_ERROR", "Request validation failed", fieldErrors);

export const unauthorized = () =>
	errorJson(401, "UNAUTHORIZED", "Authentication is required");

export const csrfInvalid = () =>
	errorJson(403, "CSRF_TOKEN_INVALID", "Invalid or missing CSRF token");
