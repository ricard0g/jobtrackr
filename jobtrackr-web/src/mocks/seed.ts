import type {
	MockApplicationCvRecord,
	MockAiConsentRecord,
	MockBaseCvRecord,
	MockCvGenerationRecord,
	MockJobDescriptionRecord,
	MockState,
} from "@/mocks/types";
import type { Company } from "@/types/company";
import type { Tag } from "@/types/tag";
import type { CvGenerationStatus, GeneratedCvFormat } from "@/types/cv-generation";

const demoUserId = "11111111-1111-4111-8111-111111111111";
const baseCreatedAt = "2026-06-24T09:00:00.000Z";
const baseUpdatedAt = "2026-07-01T12:00:00.000Z";
export const MOCK_AI_CONSENT_VERSION = "v1";

const extraGlobalCompanyNames = [
	"Adobe",
	"Airbnb",
	"Amazon",
	"Apple",
	"Asana",
	"Atlassian",
	"Canva",
	"Cloudflare",
	"Datadog",
	"Discord",
	"Dropbox",
	"Figma",
	"GitHub",
	"HubSpot",
	"IBM",
	"Intel",
	"Meta",
	"Netflix",
	"Notion",
	"Nvidia",
	"Oracle",
	"Palantir",
	"Salesforce",
	"Shopify",
	"Slack",
	"Snowflake",
	"Spotify",
	"Square",
	"Twilio",
	"Uber",
	"Zoom",
] as const;

const createGlobalCompany = (
	companyId: number,
	companyName: string,
): Company => ({
	companyId,
	userId: null,
	global: true,
	companyName,
	companyWebsiteUrl: `https://www.${companyName.toLowerCase().replace(/\s+/g, "")}.example`,
	companyLocation: null,
	companyType: "Enterprise",
	companyLogo: null,
	companyCreatedAt: baseCreatedAt,
	companyUpdatedAt: baseUpdatedAt,
});

const contentTypeForFormat = (format: GeneratedCvFormat) => {
	if (format === "PDF") return "application/pdf";
	if (format === "DOCX") {
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	}
	return "text/markdown";
};

export const createMockBaseCv = (
	overrides: Partial<MockBaseCvRecord> & Pick<MockBaseCvRecord, "baseCvId">,
): MockBaseCvRecord => ({
	userId: demoUserId,
	sha256: `sha-${overrides.baseCvId}`,
	originalFilename: `base-cv-${overrides.baseCvId}.pdf`,
	format: "PDF",
	contentType: "application/pdf",
	byteSize: 1024,
	createdAt: baseUpdatedAt,
	...overrides,
});

export const createMockCvGeneration = (
	overrides: Partial<MockCvGenerationRecord> &
		Pick<MockCvGenerationRecord, "cvGenerationId" | "applicationId" | "status">,
): MockCvGenerationRecord => {
	const status: CvGenerationStatus = overrides.status;
	const format: GeneratedCvFormat = overrides.requestedFormat ?? "PDF";
	const createdAt = overrides.createdAt ?? baseUpdatedAt;
	return {
		userId: demoUserId,
		baseCvId: 1,
		requestedFormat: format,
		idempotencyKey: `idem-${overrides.cvGenerationId}`,
		correlationId: `00000000-0000-4000-8000-${String(overrides.cvGenerationId).padStart(12, "0")}`,
		errorCode: status === "FAILED" ? "GENERATION_FAILED" : status === "CANCELLED" ? "CANCELLED" : null,
		errorMessage:
			status === "FAILED"
				? "The generation service failed to produce a document."
				: status === "CANCELLED"
					? "Generation cancelled by user"
					: null,
		applicationCvId: null,
		modelId: status === "COMPLETED" ? "gemini-mock" : null,
		workflowVersion: status === "COMPLETED" ? "v1" : null,
		createdAt,
		updatedAt: createdAt,
		startedAt: status === "PENDING" || status === "CANCELLED" ? null : createdAt,
		completedAt:
			status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" ? createdAt : null,
		statusUrl: `/api/v1/cv-generations/${overrides.cvGenerationId}`,
		jobDescriptionSnapshot: "Mock job description for CV generation.",
		additionalInformation: null,
		consentVersion: MOCK_AI_CONSENT_VERSION,
		attemptCount: status === "PENDING" ? 0 : 1,
		maxAttempts: 3,
		...overrides,
	};
};

export const createMockApplicationCv = (
	overrides: Partial<MockApplicationCvRecord> &
		Pick<MockApplicationCvRecord, "applicationCvId" | "applicationId" | "version">,
): MockApplicationCvRecord => {
	const format: GeneratedCvFormat = overrides.format ?? "PDF";
	return {
		userId: demoUserId,
		originalFilename: `application-${overrides.applicationId}-v${overrides.version}.${format === "MARKDOWN" ? "md" : format.toLowerCase()}`,
		format,
		contentType: contentTypeForFormat(format),
		byteSize: 2048,
		generationId: null,
		createdAt: baseUpdatedAt,
		...overrides,
	};
};

export const createMockJobDescription = (
	overrides: Partial<MockJobDescriptionRecord> & Pick<MockJobDescriptionRecord, "applicationId">,
): MockJobDescriptionRecord => ({
	userId: demoUserId,
	jobDescriptionText: `Job description for application ${overrides.applicationId}.`,
	...overrides,
});

export const createMockAiConsent = (
	overrides: Partial<MockAiConsentRecord> = {},
): MockAiConsentRecord => ({
	userId: demoUserId,
	consentVersion: MOCK_AI_CONSENT_VERSION,
	consentedAt: baseUpdatedAt,
	current: true,
	...overrides,
});

/** Seed helpers for Generate CV MSW scenarios. */
export const generateSeedStates = {
	empty: () => ({
		cvGenerations: [] as MockCvGenerationRecord[],
		applicationCvs: [] as MockApplicationCvRecord[],
	}),
	queued: () => ({
		cvGenerations: [
			createMockCvGeneration({
				cvGenerationId: 1,
				applicationId: 1,
				status: "PENDING",
				createdAt: "2026-07-16T10:00:00.000Z",
			}),
		],
		applicationCvs: [] as MockApplicationCvRecord[],
	}),
	processing: () => ({
		cvGenerations: [
			createMockCvGeneration({
				cvGenerationId: 2,
				applicationId: 2,
				status: "PROCESSING",
				createdAt: "2026-07-16T10:05:00.000Z",
			}),
		],
		applicationCvs: [] as MockApplicationCvRecord[],
	}),
	successful: () => {
		const generation = createMockCvGeneration({
			cvGenerationId: 3,
			applicationId: 2,
			status: "COMPLETED",
			applicationCvId: 1,
			createdAt: "2026-07-15T09:00:00.000Z",
		});
		const applicationCv = createMockApplicationCv({
			applicationCvId: 1,
			applicationId: 2,
			version: 1,
			generationId: 3,
		});
		return { cvGenerations: [generation], applicationCvs: [applicationCv] };
	},
	failed: () => ({
		cvGenerations: [
			createMockCvGeneration({
				cvGenerationId: 4,
				applicationId: 3,
				status: "FAILED",
				createdAt: "2026-07-14T11:00:00.000Z",
			}),
		],
		applicationCvs: [] as MockApplicationCvRecord[],
	}),
	cancelled: () => ({
		cvGenerations: [
			createMockCvGeneration({
				cvGenerationId: 5,
				applicationId: 3,
				status: "CANCELLED",
				createdAt: "2026-07-13T08:00:00.000Z",
			}),
		],
		applicationCvs: [] as MockApplicationCvRecord[],
	}),
	quotaFull: (applicationId = 1) => ({
		cvGenerations: Array.from({ length: 20 }, (_, index) =>
			createMockCvGeneration({
				cvGenerationId: index + 1,
				applicationId,
				status: "COMPLETED",
				applicationCvId: index + 1,
				createdAt: `2026-07-${String(Math.min(index + 1, 28)).padStart(2, "0")}T12:00:00.000Z`,
			}),
		),
		applicationCvs: Array.from({ length: 20 }, (_, index) =>
			createMockApplicationCv({
				applicationCvId: index + 1,
				applicationId,
				version: index + 1,
				generationId: index + 1,
			}),
		),
	}),
	consentRequired: () => ({
		aiConsents: [
			createMockAiConsent({
				consentVersion: null,
				consentedAt: null,
				current: false,
			}),
		],
	}),
};

export const createSeedState = (): MockState => {
	const successful = generateSeedStates.successful();
	const queued = generateSeedStates.queued();
	const processing = generateSeedStates.processing();
	const failed = generateSeedStates.failed();
	const cancelled = generateSeedStates.cancelled();

	return {
		version: 2,
		csrfToken: "mock-csrf-token",
		activeRefreshToken: null,
		users: [
			{
				userId: demoUserId,
				userEmail: "demo@jobtrackr.local",
				userDisplayName: "Demo User",
				userPictureUrl: null,
				userEnabled: true,
				userLocked: false,
				userDeletedAt: null,
				userPasswordChangedAt: null,
				userLastLoginAt: null,
				userCreatedAt: "2026-06-01T08:00:00.000Z",
				userUpdatedAt: baseUpdatedAt,
			},
		],
		credentials: [
			{
				userId: demoUserId,
				email: "demo@jobtrackr.local",
				password: "password123",
			},
		],
		sessions: [],
		companies: [
			{
				companyId: 1,
				userId: null,
				global: true,
				companyName: "Google",
				companyWebsiteUrl: "https://www.google.com",
				companyLocation: "Mountain View, CA",
				companyType: "Enterprise",
				companyLogo: "https://logos.hunter.io/google.com",
				companyCreatedAt: baseCreatedAt,
				companyUpdatedAt: baseUpdatedAt,
			},
			{
				companyId: 2,
				userId: null,
				global: true,
				companyName: "Stripe",
				companyWebsiteUrl: "https://www.stripe.com",
				companyLocation: "San Francisco, CA",
				companyType: "Fintech",
				companyLogo: "https://logos.hunter.io/stripe.com",
				companyCreatedAt: baseCreatedAt,
				companyUpdatedAt: baseUpdatedAt,
			},
			{
				companyId: 3,
				userId: null,
				global: true,
				companyName: "Microsoft",
				companyWebsiteUrl: "https://www.microsoft.com",
				companyLocation: "Redmond, WA",
				companyType: "Enterprise",
				companyLogo: "https://logos.hunter.io/microsoft.com",
				companyCreatedAt: baseCreatedAt,
				companyUpdatedAt: baseUpdatedAt,
			},
			{
				companyId: 4,
				userId: demoUserId,
				global: false,
				companyName: "Northstar Labs",
				companyWebsiteUrl: "https://northstar.example",
				companyLocation: "Madrid, Spain",
				companyType: "Product",
				companyLogo: null,
				companyCreatedAt: baseCreatedAt,
				companyUpdatedAt: baseUpdatedAt,
			},
			{
				companyId: 5,
				userId: demoUserId,
				global: false,
				companyName: "Cobalt Systems",
				companyWebsiteUrl: "https://cobalt.example",
				companyLocation: "Remote",
				companyType: "SaaS",
				companyLogo: null,
				companyCreatedAt: baseCreatedAt,
				companyUpdatedAt: baseUpdatedAt,
			},
			{
				companyId: 6,
				userId: demoUserId,
				global: false,
				companyName: "Atlas Cloud",
				companyWebsiteUrl: "https://atlas.example",
				companyLocation: "Barcelona, Spain",
				companyType: "Platform",
				companyLogo: null,
				companyCreatedAt: baseCreatedAt,
				companyUpdatedAt: baseUpdatedAt,
			},
			...extraGlobalCompanyNames.map((companyName, index) =>
				createGlobalCompany(index + 7, companyName),
			),
		],
		tags: [
			{
				tagId: 1,
				tagCategory: "TECH_STACK",
				tagName: "React",
				tagColor: "#00A7D6",
				global: true,
			},
			{
				tagId: 2,
				tagCategory: "TECH_STACK",
				tagName: "Spring Boot",
				tagColor: "#00A86B",
				global: true,
			},
			{
				tagId: 3,
				tagCategory: "MODALITY",
				tagName: "Remote",
				tagColor: "#5765BD",
				global: true,
			},
			{
				tagId: 4,
				tagCategory: "COMPANY_TYPE",
				tagName: "Startup",
				tagColor: "#F5D800",
				global: false,
				userId: demoUserId,
			} as Tag & { userId: string },
		],
		applications: [
			{
				applicationId: 1,
				userId: demoUserId,
				companyId: 4,
				tagIds: [1, 4],
				applicationTitle: "Frontend Engineer",
				applicationJobUrl: "https://northstar.example/jobs/frontend-engineer",
				applicationLocation: "Madrid, Spain",
				applicationRemoteType: "HYBRID",
				applicationSource: "Company website",
				applicationSalaryMin: 52000,
				applicationSalaryMax: 68000,
				applicationCurrency: "EUR",
				applicationStatus: "APPLIED",
				applicationKanbanOrder: 0,
				applicationAppliedAt: "2026-06-25T00:00:00.000Z",
				applicationCreatedAt: "2026-06-25T09:15:00.000Z",
				applicationUpdatedAt: baseUpdatedAt,
			},
			{
				applicationId: 2,
				userId: demoUserId,
				companyId: 5,
				tagIds: [1, 3],
				applicationTitle: "Full Stack Developer",
				applicationJobUrl: null,
				applicationLocation: "Remote",
				applicationRemoteType: "REMOTE",
				applicationSource: "LinkedIn",
				applicationSalaryMin: 60000,
				applicationSalaryMax: 76000,
				applicationCurrency: "EUR",
				applicationStatus: "INTERVIEW",
				applicationKanbanOrder: 0,
				applicationAppliedAt: "2026-06-20T00:00:00.000Z",
				applicationCreatedAt: "2026-06-20T10:30:00.000Z",
				applicationUpdatedAt: baseUpdatedAt,
			},
			{
				applicationId: 3,
				userId: demoUserId,
				companyId: 6,
				tagIds: [2],
				applicationTitle: "Backend Engineer",
				applicationJobUrl: "https://atlas.example/careers/backend",
				applicationLocation: "Barcelona, Spain",
				applicationRemoteType: "ON_SITE",
				applicationSource: "Referral",
				applicationSalaryMin: 58000,
				applicationSalaryMax: 72000,
				applicationCurrency: "EUR",
				applicationStatus: "IN_REVIEW",
				applicationKanbanOrder: 0,
				applicationAppliedAt: "2026-06-28T00:00:00.000Z",
				applicationCreatedAt: "2026-06-28T16:45:00.000Z",
				applicationUpdatedAt: baseUpdatedAt,
			},
		],
		interviews: [
			{
				interviewId: 1,
				applicationId: 2,
				interviewType: "PHONE",
				interviewScheduledAt: "2026-07-06T09:30:00.000Z",
				interviewLocation: "Google Meet",
				interviewNotes: "Recruiter screen.",
				interviewOutcome: "PENDING",
				interviewCreatedAt: baseUpdatedAt,
				interviewUpdatedAt: baseUpdatedAt,
			},
			{
				interviewId: 2,
				applicationId: 2,
				interviewType: "TECHNICAL",
				interviewScheduledAt: "2026-07-09T14:00:00.000Z",
				interviewLocation: "Zoom",
				interviewNotes: "React and API design discussion.",
				interviewOutcome: "PENDING",
				interviewCreatedAt: baseUpdatedAt,
				interviewUpdatedAt: baseUpdatedAt,
			},
		],
		statusHistories: [
			{
				statusHistoryId: 1,
				applicationId: 2,
				statusHistoryOldStatus: "APPLIED",
				statusHistoryNewStatus: "INTERVIEW",
				statusHistoryChangedAt: "2026-06-30T13:20:00.000Z",
				statusHistoryCreatedAt: "2026-06-30T13:20:00.000Z",
			},
		],
		baseCvs: [
			createMockBaseCv({
				baseCvId: 1,
				originalFilename: "ricardo-base.pdf",
				format: "PDF",
				contentType: "application/pdf",
				byteSize: 245_760,
				createdAt: "2026-07-10T09:00:00.000Z",
			}),
			createMockBaseCv({
				baseCvId: 2,
				originalFilename: "ricardo-base.md",
				format: "MARKDOWN",
				contentType: "text/markdown",
				byteSize: 12_288,
				createdAt: "2026-07-11T09:00:00.000Z",
			}),
		],
		cvGenerations: [
			...queued.cvGenerations,
			...processing.cvGenerations,
			...successful.cvGenerations,
			...failed.cvGenerations,
			...cancelled.cvGenerations,
		],
		applicationCvs: [...successful.applicationCvs],
		jobDescriptions: [
			createMockJobDescription({
				applicationId: 1,
				jobDescriptionText:
					"Frontend Engineer at Northstar Labs. React, TypeScript, and design systems experience required.",
			}),
			createMockJobDescription({
				applicationId: 2,
				jobDescriptionText:
					"Full Stack Developer at Cobalt Systems. React and Spring Boot across product squads.",
			}),
			createMockJobDescription({
				applicationId: 3,
				jobDescriptionText:
					"Backend Engineer at Atlas Cloud. Java, Spring Boot, and cloud-native services.",
			}),
		],
		aiConsents: [createMockAiConsent()],
		counters: {
			applicationId: 4,
			companyId: 7 + extraGlobalCompanyNames.length,
			interviewId: 3,
			statusHistoryId: 2,
			tagId: 5,
			baseCvId: 3,
			cvGenerationId: 6,
			applicationCvId: 2,
		},
	};
};
