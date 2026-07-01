export interface User {
	userId: string;
	userEmail: string;
	userDisplayName: string | null;
	userPictureUrl: string | null;
	userEnabled: boolean;
	userLocked: boolean;
	userDeletedAt: string | null;
	userPasswordChangedAt: string | null;
	userLastLoginAt: string | null;
	userCreatedAt: string;
	userUpdatedAt: string;
}
