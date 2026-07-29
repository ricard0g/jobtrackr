import {
    normalizeDocumentsState,
    serializeDocumentsState,
} from "@/routes/documents-data";

const INTERNAL_ORIGIN = "https://jobtrackr.local";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

export const applicationCloseDestination = (state: unknown): string => {
    if (!isRecord(state) || typeof state.returnTo !== "string") return "/";

    const returnTo = state.returnTo;
    let url: URL;

    try {
        url = new URL(returnTo, INTERNAL_ORIGIN);
    } catch {
        return "/";
    }

    if (url.origin !== INTERNAL_ORIGIN || url.pathname !== "/documents") {
        return "/";
    }

    const canonicalReturnTo =
        `${url.pathname}${serializeDocumentsState(normalizeDocumentsState(url.search))}${url.hash}`;

    return canonicalReturnTo === returnTo ? returnTo : "/";
};
