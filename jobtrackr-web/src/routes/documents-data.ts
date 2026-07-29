import {
	replace,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type ShouldRevalidateFunctionArgs,
} from "react-router";

import { api, ApiError, requireSession } from "@/lib/api";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCvSummary } from "@/types/generated-cv";

export const GENERATED_CV_PAGE_SIZE = 20;

const documentsTabConfig = {
	generated: {
		defaultSort: "created",
		sortKeys: ["name", "type", "size", "created", "version", "company"],
	},
	base: {
		defaultSort: "uploaded",
		sortKeys: ["name", "type", "size", "uploaded"],
	},
} as const;

export type DocumentsTab = keyof typeof documentsTabConfig;
export type SortDirection = "asc" | "desc";
type GeneratedSortKey = (typeof documentsTabConfig.generated.sortKeys)[number];
type BaseSortKey = (typeof documentsTabConfig.base.sortKeys)[number];

export type DocumentsUrlState =
	| {
			tab: "generated";
			page: number;
			sort: GeneratedSortKey;
			direction: SortDirection;
	  }
	| {
			tab: "base";
			page: number;
			sort: BaseSortKey;
			direction: SortDirection;
	  };

export const defaultDocumentsState = (tab: DocumentsTab): DocumentsUrlState =>
	tab === "base"
		? { tab, page: 1, sort: documentsTabConfig.base.defaultSort, direction: "desc" }
		: { tab, page: 1, sort: documentsTabConfig.generated.defaultSort, direction: "desc" };

export const serializeDocumentsState = ({ tab, page, sort, direction }: DocumentsUrlState) => {
	const search = new URLSearchParams();
	search.set("tab", tab);
	search.set("page", String(page));
	search.set("sort", sort);
	search.set("direction", direction);
	return `?${search.toString()}`;
};

const normalizedPage = (value: string | null) => {
	const page = Number(value);
	return Number.isInteger(page) && page > 0 ? page : 1;
};

const normalizedDirection = (value: string | null): SortDirection =>
	value === "asc" || value === "desc" ? value : "desc";

export const normalizeDocumentsState = (search: string): DocumentsUrlState => {
	const params = new URLSearchParams(search);
	const page = normalizedPage(params.get("page"));
	const direction = normalizedDirection(params.get("direction"));
	const requestedSort = params.get("sort");

	if (params.get("tab") === "base") {
		const config = documentsTabConfig.base;
		const sort = config.sortKeys.find((sortKey) => sortKey === requestedSort) ?? config.defaultSort;
		return { tab: "base", page, sort, direction };
	}

	const config = documentsTabConfig.generated;
	const sort = config.sortKeys.find((sortKey) => sortKey === requestedSort) ?? config.defaultSort;
	return { tab: "generated", page, sort, direction };
};

export const ensureCanonicalDocumentsUrl = (request: Request) => {
	const url = new URL(request.url);
	const canonicalSearch = serializeDocumentsState(normalizeDocumentsState(url.search));
	if (url.search === canonicalSearch) return;
	throw replace(`${url.pathname}${canonicalSearch}${url.hash}`);
};

export type DocumentsLoaderData = {
	baseCvs: BaseCv[];
	generatedCvs: GeneratedCvSummary[];
	generatedCvsPage: number;
	generatedCvsTotal: number;
	generatedCvsError: string | null;
};

export type DocumentsActionIntent =
	| "upload"
	| "delete"
	| "download"
	| "delete-generated-cv"
	| "download-generated-cv";

export type DocumentsActionData = {
	ok: boolean;
	intent: DocumentsActionIntent;
	error?: string;
	uri?: string;
};

const errorMessages: Record<string, string> = {
	INVALID_BASE_CV_FORMAT: "Choose a PDF, DOCX, or Markdown file with the correct file extension.",
	BASE_CV_TOO_LARGE: "The file is larger than the 10 MB limit.",
	MALFORMED_BASE_CV: "This document is malformed or has no meaningful extractable text.",
	PROTECTED_BASE_CV: "Password-protected or encrypted documents are not supported.",
	DUPLICATE_BASE_CV: "This exact document is already in your Base CV library.",
	BASE_CV_LIMIT_REACHED: "You have reached the limit of 20 Base CVs. Delete one before uploading another.",
	BASE_CV_NOT_FOUND: "This Base CV is no longer available.",
	BASE_CV_STORAGE_UNAVAILABLE: "Document storage is temporarily unavailable. Please try again.",
	GENERATED_CV_NOT_FOUND: "This Generated CV is no longer available.",
	STORAGE_UNAVAILABLE: "Document storage is temporarily unavailable. Please try again.",
};

const messageFromError = (error: unknown, fallback: string) => {
	if (error instanceof ApiError) {
		return (error.code && errorMessages[error.code]) || error.message;
	}
	return error instanceof Error ? error.message : fallback;
};

const actionError = (intent: DocumentsActionIntent, error: unknown): DocumentsActionData => ({
	ok: false,
	intent,
	error: messageFromError(error, "The operation could not be completed."),
});

const loadGeneratedCvsPage = async () => {
	try {
		const page = await api.getGeneratedCvsPage({ page: 0, size: GENERATED_CV_PAGE_SIZE });
		return {
			generatedCvs: page.items,
			generatedCvsPage: page.page,
			generatedCvsTotal: page.total,
			generatedCvsError: null as string | null,
		};
	} catch (error) {
		return {
			generatedCvs: [] as GeneratedCvSummary[],
			generatedCvsPage: 0,
			generatedCvsTotal: 0,
			generatedCvsError: messageFromError(error, "Generated CVs could not be loaded."),
		};
	}
};

export async function documentsLoader({ request }: LoaderFunctionArgs): Promise<DocumentsLoaderData> {
	ensureCanonicalDocumentsUrl(request);
	await requireSession();
	const baseCvs = await api.getBaseCvs();
	const generated = await loadGeneratedCvsPage();
	return { baseCvs, ...generated };
}

export async function documentsAction({ request }: ActionFunctionArgs): Promise<DocumentsActionData> {
	await requireSession();
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "") as DocumentsActionIntent;

	try {
		if (intent === "upload") {
			const file = formData.get("file");
			if (!(file instanceof File) || file.size === 0) {
				return { ok: false, intent: "upload", error: "Choose one file to upload." };
			}
			await api.uploadBaseCv(file);
			return { ok: true, intent: "upload" };
		}

		if (intent === "delete") {
			const baseCvId = Number(formData.get("baseCvId"));
			if (!Number.isInteger(baseCvId) || baseCvId <= 0) {
				return { ok: false, intent: "delete", error: "Invalid Base CV." };
			}
			await api.deleteBaseCv(baseCvId);
			return { ok: true, intent: "delete" };
		}

		if (intent === "download") {
			const baseCvId = Number(formData.get("baseCvId"));
			if (!Number.isInteger(baseCvId) || baseCvId <= 0) {
				return { ok: false, intent: "download", error: "Invalid Base CV." };
			}
			const download = await api.getBaseCvDownload(baseCvId);
			return { ok: true, intent: "download", uri: download.uri };
		}

		if (intent === "delete-generated-cv") {
			const generatedCvId = Number(formData.get("generatedCvId"));
			if (!Number.isInteger(generatedCvId) || generatedCvId <= 0) {
				return { ok: false, intent: "delete-generated-cv", error: "Invalid Generated CV." };
			}
			await api.deleteGeneratedCv(generatedCvId);
			return { ok: true, intent: "delete-generated-cv" };
		}

		if (intent === "download-generated-cv") {
			const generatedCvId = Number(formData.get("generatedCvId"));
			if (!Number.isInteger(generatedCvId) || generatedCvId <= 0) {
				return { ok: false, intent: "download-generated-cv", error: "Invalid Generated CV." };
			}
			const download = await api.getGeneratedCvDownload(generatedCvId);
			return { ok: true, intent: "download-generated-cv", uri: download.uri };
		}

		throw new Response("Unsupported action", { status: 400 });
	} catch (error) {
		const knownIntents: DocumentsActionIntent[] = [
			"upload",
			"delete",
			"download",
			"delete-generated-cv",
			"download-generated-cv",
		];
		const fallbackIntent = knownIntents.includes(intent) ? intent : "upload";
		return actionError(fallbackIntent, error);
	}
}

export function documentsShouldRevalidate({
	formData,
	defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
	const intent = formData?.get("intent");
	if (intent === "download" || intent === "download-generated-cv") {
		return false;
	}
	return defaultShouldRevalidate;
}
