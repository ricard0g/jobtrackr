import type { User } from "./user";

export interface AuthResponse {
	accessToken: string;
	tokenType: "Bearer";
	expiresIn: number;
	user: User;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface RegisterRequest extends LoginRequest {
	displayName?: string;
}

export type AuthActionData = {
	formError?: string;
	fieldErrors?: Record<string, string>;
	values?: Partial<LoginRequest & RegisterRequest>;
};
