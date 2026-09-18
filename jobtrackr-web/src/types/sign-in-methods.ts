export type PasswordSignInMethod = {
	enabled: boolean;
	changedAt: string | null;
};

export type GoogleSignInMethod = {
	connected: boolean;
	providerEmail: string | null;
	linkedAt: string | null;
	lastUsedAt: string | null;
};

export type SignInMethods = {
	password: PasswordSignInMethod;
	google: GoogleSignInMethod;
};
