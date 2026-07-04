export interface Company {
	companyId: number;
	userId: string | null;
	global: boolean;
	companyName: string;
	companyWebsiteUrl: string | null;
	companyLocation: string | null;
	companyType: string | null;
	companyLogo: string | null;
	companyCreatedAt: string;
	companyUpdatedAt: string;
}

export interface CompanyWriteRequest {
	companyName: string;
	companyWebsiteUrl?: string | null;
	companyLocation?: string | null;
	companyType?: string | null;
	companyLogo?: string | null;
}
