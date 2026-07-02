import type { Application } from "@/types/application";
import type { Tag } from "@/types/tag";
import { createSeedState } from "@/mocks/seed";
import type {
	MockApplicationRecord,
	MockEntityName,
	MockState,
} from "@/mocks/types";

const STORAGE_KEY = "jobtrackr:mock-state:v1";
const DEFAULT_TAG_COLOR = "#808080";

const isMockState = (value: unknown): value is MockState =>
	typeof value === "object" &&
	value !== null &&
	"version" in value &&
	(value as { version?: unknown }).version === 1;

export const loadState = (): MockState => {
	const rawValue = window.localStorage.getItem(STORAGE_KEY);
	if (!rawValue) {
		const seededState = createSeedState();
		saveState(seededState);
		return seededState;
	}

	try {
		const parsedValue: unknown = JSON.parse(rawValue);
		if (isMockState(parsedValue)) return parsedValue;
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
