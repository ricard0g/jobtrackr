import type { Company } from "./company";
import type { Tag } from "./tag";

export type ApplicationStatus =
	| "APPLIED"
	| "IN_REVIEW"
	| "INTERVIEW"
	| "OFFER"
	| "REJECTED"
	| "WITHDRAWN";

export type RemoteType = "ON_SITE" | "HYBRID" | "REMOTE";

export interface Application {
	applicationId: number;
	userId: string;
	applicationTitle: string;
	applicationJobUrl: string | null;
	applicationLocation: string | null;
	applicationRemoteType: RemoteType | null;
	applicationSource: string | null;
	applicationSalaryMin: number | null;
	applicationSalaryMax: number | null;
	applicationCurrency: string | null;
	applicationStatus: ApplicationStatus;
	applicationKanbanOrder: number;
	applicationAppliedAt: string | null;
	applicationCreatedAt: string;
	applicationUpdatedAt: string;
	company: Company;
	tags: Tag[];
}

export interface ApplicationCreateRequest {
	companyId: number;
	applicationTitle: string;
	applicationStatus: ApplicationStatus;
	applicationJobUrl?: string | null;
	applicationLocation?: string | null;
	applicationRemoteType?: RemoteType | null;
	applicationSource?: string | null;
	applicationSalaryMin?: number | null;
	applicationSalaryMax?: number | null;
	applicationCurrency?: string | null;
	applicationKanbanOrder?: number | null;
	applicationAppliedAt?: string | null;
	tagIds?: number[];
}

export interface ApplicationPatchRequest {
	companyId?: number;
	applicationTitle?: string;
	applicationJobUrl?: string | null;
	applicationLocation?: string | null;
	applicationRemoteType?: RemoteType | null;
	applicationSource?: string | null;
	applicationSalaryMin?: number | null;
	applicationSalaryMax?: number | null;
	applicationCurrency?: string | null;
	applicationKanbanOrder?: number | null;
	applicationAppliedAt?: string | null;
	addTagIds?: number[];
	removeTagIds?: number[];
}

export interface ApplicationStatusPatchRequest {
	applicationStatus: ApplicationStatus;
}

export const applicationStatusOptions: Array<{
	value: ApplicationStatus;
	label: string;
	color: string;
}> = [
	{ value: "APPLIED", label: "Applied", color: "#5765BD" },
	{ value: "IN_REVIEW", label: "In Review", color: "#F5D800" },
	{ value: "INTERVIEW", label: "Interview", color: "#00A7D6" },
	{ value: "OFFER", label: "Offer", color: "#00A86B" },
	{ value: "REJECTED", label: "Rejected", color: "#878787" },
	{ value: "WITHDRAWN", label: "Withdrawn", color: "#9C7D48" },
];

export const getApplicationStatusOption = (value: ApplicationStatus | string) =>
	applicationStatusOptions.find((option) => option.value === value) ?? {
		value: value as ApplicationStatus,
		label: value,
		color: "#666666",
	};
