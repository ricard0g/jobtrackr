export interface Company {
	companyId: number;
	userId: string;
	companyName: string;
	companyWebsiteUrl: string | null;
	companyLocation: string | null;
	companyType: string | null;
	companyLogo: string | null;
	companyCreatedAt: string;
	companyUpdatedAt: string;
}
