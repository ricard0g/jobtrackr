import type { ActionFunctionArgs } from "react-router";

import { api, ApiError, requireSession } from "@/lib/api";
import type { BaseCv } from "@/types/base-cv";

export type DocumentsLoaderData = { baseCvs: BaseCv[] };
export type DocumentsActionData = {
	ok: boolean;
	intent: "upload" | "delete";
	error?: string;
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
};

export async function documentsLoader(): Promise<DocumentsLoaderData> {
	await requireSession();
	return { baseCvs: await api.getBaseCvs() };
}

export async function documentsAction({ request }: ActionFunctionArgs): Promise<DocumentsActionData> {
	await requireSession();
	const formData = await request.formData();
	const intent = String(formData.get("intent") ?? "");

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

		throw new Response("Unsupported action", { status: 400 });
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				ok: false,
				intent: intent === "delete" ? "delete" : "upload",
				error: (error.code && errorMessages[error.code]) || error.message,
			};
		}
		return {
			ok: false,
			intent: intent === "delete" ? "delete" : "upload",
			error: error instanceof Error ? error.message : "The operation could not be completed.",
		};
	}
}
