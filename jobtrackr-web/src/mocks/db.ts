import type { Application } from "@/types/application";
import type { Company } from "@/types/company";
import type { Tag } from "@/types/tag";
import { createSeedState } from "@/mocks/seed";
import type {
	MockApplicationRecord,
	MockEntityName,
	MockState,
} from "@/mocks/types";

const STORAGE_KEY = "jobtrackr:mock-state:v2";
const DEFAULT_TAG_COLOR = "#808080";
const HUNTER_LOGO_BASE_URL = "https://logos.hunter.io/";

const isMockState = (value: unknown): value is MockState =>
	typeof value === "object" &&
	value !== null &&
	"version" in value &&
	(value as { version?: unknown }).version === 2;

export const loadState = (): MockState => {
	const rawValue = window.localStorage.getItem(STORAGE_KEY);
	if (!rawValue) {
		const seededState = createSeedState();
		saveState(seededState);
		return seededState;
	}

	try {
		const parsedValue: unknown = JSON.parse(rawValue);
		if (isMockState(parsedValue)) {
			const legacy = parsedValue as MockState & {
				applicationCvs?: Array<Record<string, unknown> & { applicationCvId?: number }>;
				counters: MockState["counters"] & { applicationCvId?: number };
			};
			legacy.baseCvs ??= [];
			legacy.cvGenerations ??= [];
			legacy.jobDescriptions ??= [];
			legacy.aiConsents ??= [];
			legacy.counters.baseCvId ??= 1;
			legacy.counters.cvGenerationId ??= 1;
			legacy.counters.generatedCvId ??= legacy.counters.applicationCvId ?? 1;
			const hadLegacyCvs = legacy.applicationCvs !== undefined;
			// Migrate only when the new key is absent. An empty generatedCvs array means
			// the user deleted every document; do not resurrect from leftover applicationCvs.
			if (legacy.generatedCvs === undefined && legacy.applicationCvs?.length) {
				legacy.generatedCvs = legacy.applicationCvs.map((cv) => {
					const { applicationCvId, ...rest } = cv;
					return {
						...rest,
						generatedCvId: applicationCvId ?? 0,
					} as MockState["generatedCvs"][number];
				});
			}
			legacy.generatedCvs ??= [];
			delete legacy.applicationCvs;
			delete legacy.counters.applicationCvId;
			let migratedGenerationFields = false;
			for (const generation of legacy.cvGenerations as Array<
				Record<string, unknown> & {
					generatedCvId?: number | null;
					applicationCvId?: number | null;
				}
			>) {
				if (!("generatedCvId" in generation) && "applicationCvId" in generation) {
					generation.generatedCvId = generation.applicationCvId ?? null;
					migratedGenerationFields = true;
				}
				if ("applicationCvId" in generation) {
					delete generation.applicationCvId;
					migratedGenerationFields = true;
				}
			}
			if (hadLegacyCvs || migratedGenerationFields) {
				saveState(legacy);
			}
			return legacy;
		}
	} catch {
		// Fall through to reseed corrupt local data.
	}

	const seededState = createSeedState();
	saveState(seededState);
	return seededState;
};

export const saveState = (state: MockState) => {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const resetState = () => {
	const seededState = createSeedState();
	saveState(seededState);
	return seededState;
};

export const nowIso = () => new Date().toISOString();

export const nextId = (state: MockState, entity: MockEntityName) => {
	const id = state.counters[entity];
	state.counters[entity] += 1;
	return id;
};

export const normalizeEmail = (value: string) =>
	value.trim().toLowerCase();

export const normalizeOptional = (value: string | null | undefined) => {
	if (value === null || value === undefined) return null;
	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
};

export const normalizeTagColor = (value: string | null | undefined) => {
	const normalizedValue = normalizeOptional(value);
	return normalizedValue ?? DEFAULT_TAG_COLOR;
};

export const hunterLogoUrlFromWebsite = (websiteUrl: string | null | undefined) => {
	const normalizedWebsite = normalizeOptional(websiteUrl);
	if (!normalizedWebsite) return null;
	const normalizedUrl = normalizedWebsite.includes("://")
		? normalizedWebsite
		: `https://${normalizedWebsite}`;
	try {
		const host = new URL(normalizedUrl).hostname;
		const domain = host.startsWith("www.") ? host.slice(4) : host;
		return domain ? `${HUNTER_LOGO_BASE_URL}${domain}` : null;
	} catch {
		return null;
	}
};

export const resolveCompanyLogo = (
	companyLogo: string | null | undefined,
	companyWebsiteUrl: string | null | undefined,
) => normalizeOptional(companyLogo) ?? hunterLogoUrlFromWebsite(companyWebsiteUrl);

export const toApplication = (
	state: MockState,
	record: MockApplicationRecord,
): Application => {
	const company = state.companies.find(
		(candidate) => candidate.companyId === record.companyId,
	);
	const tagIds = new Set(record.tagIds);
	const tags = state.tags
		.filter((tag) => tagIds.has(tag.tagId))
		.toSorted((left, right) => left.tagId - right.tagId);

	if (!company) {
		throw new Error(`Mock application ${record.applicationId} has no company`);
	}

	const { companyId, tagIds: _tagIds, ...application } = record;
	void companyId;
	void _tagIds;

	return {
		...application,
		company,
		tags,
	};
};

export const isUserOwnedCompany = (company: Company, userId: string) =>
	!company.global && company.userId === userId;

export const getAccessibleCompanies = (state: MockState, userId: string): Company[] =>
	state.companies
		.filter((company) => company.global || isUserOwnedCompany(company, userId))
		.toSorted((left, right) => left.companyName.localeCompare(right.companyName));

export const findAccessibleCompany = (
	state: MockState,
	userId: string,
	companyId: number,
) =>
	state.companies.find(
		(company) =>
			company.companyId === companyId &&
			(company.global || isUserOwnedCompany(company, userId)),
	);

export const findOwnedCompany = (
	state: MockState,
	userId: string,
	companyId: number,
) =>
	state.companies.find(
		(company) => company.companyId === companyId && isUserOwnedCompany(company, userId),
	);

export const getAccessibleTags = (state: MockState, userId: string): Tag[] =>
	state.tags
		.filter((tag) => tag.global || isUserOwnedTag(tag, userId))
		.toSorted((left, right) => left.tagName.localeCompare(right.tagName));

export const isUserOwnedTag = (tag: Tag, userId: string) =>
	!tag.global && statefulTagOwnerId(tag) === userId;

export const statefulTagOwnerId = (tag: Tag) => {
	const ownedTag = tag as Tag & { userId?: string };
	return ownedTag.userId ?? null;
};

export const createOwnedTag = (tag: Tag, userId: string): Tag =>
	({
		...tag,
		userId,
	}) as Tag;

export const findAccessibleTag = (
	state: MockState,
	userId: string,
	tagId: number,
) =>
	state.tags.find(
		(tag) => tag.tagId === tagId && (tag.global || isUserOwnedTag(tag, userId)),
	);

export const resolveAccessibleTagIds = (
	state: MockState,
	userId: string,
	tagIds: number[] | undefined,
) => {
	if (!tagIds || tagIds.length === 0) return [];
	const uniqueTagIds = Array.from(new Set(tagIds));
	const allAccessible = uniqueTagIds.every((tagId) =>
		Boolean(findAccessibleTag(state, userId, tagId)),
	);
	return allAccessible ? uniqueTagIds : null;
};
