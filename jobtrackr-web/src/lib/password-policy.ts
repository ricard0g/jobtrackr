export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_UTF8_BYTES = 72;

export function passwordPolicyError(password: string): string | undefined {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
	}

	if (new TextEncoder().encode(password).byteLength > PASSWORD_MAX_UTF8_BYTES) {
		return `Password must be at most ${PASSWORD_MAX_UTF8_BYTES} UTF-8 bytes.`;
	}

	return undefined;
}
