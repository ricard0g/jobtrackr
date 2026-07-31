import {
    CloudDownload,
    EllipsisVertical,
    Eye,
    File,
    Files,
    FileText,
    Link2,
    LoaderCircle,
    Trash2,
    UploadCloud,
} from "lucide-react";
import { Tabs } from "radix-ui";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type KeyboardEvent,
} from "react";
import {
    Link,
    useFetcher,
    useLoaderData,
    useLocation,
    useNavigate,
    useNavigation,
    useRevalidator,
    useRouteLoaderData,
} from "react-router";

import {
    DocumentPreviewDialog,
    type PreviewableDocument,
} from "@/components/documents/DocumentPreviewDialog";
import {
    DocumentTable,
    type DocumentTableColumn,
} from "@/components/documents/DocumentTable";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Toast,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCvSummary } from "@/types/generated-cv";
import {
    defaultDocumentsState,
    BASE_CV_PAGE_SIZE,
    DOCUMENTS_RECENT_ROUTE_ID,
    GENERATED_CV_PAGE_SIZE,
    normalizeDocumentsState,
    RECENT_GENERATED_CV_LIMIT,
    serializeDocumentsState,
    type DocumentsActionData,
    type DocumentsLoaderData,
    type DocumentsUrlState,
    type BaseSortKey,
    type GeneratedSortKey,
    type RecentGeneratedCvsData,
} from "@/routes/documents-data";

const MAX_BASE_CVS = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const acceptedExtensions = [".pdf", ".docx", ".md"];
const formatLabels = { PDF: "PDF", DOCX: "DOCX", MARKDOWN: "Markdown" } as const;

const compactNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${compactNumber.format(bytes / 1024)} kB`;
    return `${compactNumber.format(bytes / (1024 * 1024))} MB`;
};

const filenameWithoutExtension = (filename: string) => {
    const extensionIndex = filename.lastIndexOf(".");
    return extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
};

const nextSortDirection = (
    currentSort: string,
    currentDirection: "asc" | "desc",
    nextSort: string,
) => (currentSort === nextSort && currentDirection === "asc" ? "desc" : "asc");

const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const openSignedDownload = (uri: string) => {
    const link = document.createElement("a");
    link.href = uri;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.click();
};

function BaseCvActions({
    baseCv,
    onPreview,
    onFailure,
}: {
    baseCv: BaseCv;
    onPreview: (baseCv: BaseCv) => void;
    onFailure: (message: string) => void;
}) {
    const deleteFetcher = useFetcher<DocumentsActionData>();
    const downloadFetcher = useFetcher<DocumentsActionData>();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const openedDownloadRef = useRef<DocumentsActionData | null>(null);
    const reportedDeleteErrorRef = useRef<DocumentsActionData | null>(null);
    const reportedDownloadErrorRef = useRef<DocumentsActionData | null>(null);
    const deleting = deleteFetcher.state !== "idle";
    const downloading = downloadFetcher.state !== "idle";

    useEffect(() => {
        if (downloadFetcher.state !== "idle") return;
        const data = downloadFetcher.data;
        if (data?.ok === false && data.intent === "download") {
            if (reportedDownloadErrorRef.current === data) return;
            reportedDownloadErrorRef.current = data;
            onFailure(data.error ?? "The download link could not be prepared.");
            return;
        }
        if (!data?.ok || data.intent !== "download" || !data.uri) return;
        if (openedDownloadRef.current === data) return;
        openedDownloadRef.current = data;
        openSignedDownload(data.uri);
    }, [downloadFetcher.state, downloadFetcher.data, onFailure]);

    useEffect(() => {
        if (deleteFetcher.state !== "idle") return;
        const data = deleteFetcher.data;
        if (data?.ok === false && data.intent === "delete") {
            if (reportedDeleteErrorRef.current === data) return;
            reportedDeleteErrorRef.current = data;
            onFailure(data.error ?? "The Base CV could not be deleted.");
        }
    }, [deleteFetcher.state, deleteFetcher.data, onFailure]);

    const requestDelete = () => {
        setMenuOpen(false);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
        const formData = new FormData();
        formData.set("intent", "delete");
        formData.set("baseCvId", String(baseCv.baseCvId));
        deleteFetcher.submit(formData, { method: "post", action: "/documents" });
        setDeleteDialogOpen(false);
    };

    return (
        <TooltipProvider delayDuration={0}>
            <div className="flex items-center justify-center gap-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Preview ${baseCv.originalFilename}`}
                            onClick={() => onPreview(baseCv)}
                        >
                            <Eye aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preview</TooltipContent>
                </Tooltip>
                <downloadFetcher.Form method="post" action="/documents">
                    <input type="hidden" name="intent" value="download" />
                    <input type="hidden" name="baseCvId" value={baseCv.baseCvId} />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="submit"
                                variant="ghost"
                                size="icon-sm"
                                disabled={downloading}
                                aria-busy={downloading}
                                aria-label={`Download ${baseCv.originalFilename}`}
                            >
                                {downloading ? (
                                    <LoaderCircle className="animate-spin" />
                                ) : (
                                    <CloudDownload aria-hidden="true" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download</TooltipContent>
                    </Tooltip>
                </downloadFetcher.Form>
                <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`More actions for ${baseCv.originalFilename}`}
                                    aria-haspopup="menu"
                                >
                                    <EllipsisVertical aria-hidden="true" />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>More actions</TooltipContent>
                    </Tooltip>
                    <PopoverContent
                        role="menu"
                        aria-label={`More actions for ${baseCv.originalFilename}`}
                        align="end"
                        className="w-40 min-w-0 bg-[#f1f2f4] p-2.5 shadow-cool-light"
                    >
                        <Button
                            type="button"
                            role="menuitem"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-red-700"
                            disabled={deleting}
                            onClick={requestDelete}
                        >
                            <Trash2 aria-hidden="true" />
                            Delete
                        </Button>
                    </PopoverContent>
                </Popover>
            </div>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {baseCv.originalFilename}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This Base CV will no longer be available for future CV Generation.
                            Existing Generated CVs will stay in your library.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button type="button" variant="ghost" disabled={deleting}>
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            disabled={deleting}
                            onClick={confirmDelete}
                        >
                            {deleting ? (
                                <LoaderCircle className="animate-spin" />
                            ) : (
                                <Trash2 aria-hidden="true" />
                            )}
                            Delete Base CV
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </TooltipProvider>
    );
}

function GeneratedCvActions({
    generatedCv,
    onPreview,
    onDeleted,
    onFailure,
}: {
    generatedCv: GeneratedCvSummary;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
    onDeleted: (generatedCvId: number) => void;
    onFailure: (message: string) => void;
}) {
    const deleteFetcher = useFetcher<DocumentsActionData>();
    const downloadFetcher = useFetcher<DocumentsActionData>();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const openedDownloadRef = useRef<DocumentsActionData | null>(null);
    const mobileDownloadPendingRef = useRef(false);
    const removedAfterDeleteRef = useRef<DocumentsActionData | null>(null);
    const reportedDeleteErrorRef = useRef<DocumentsActionData | null>(null);
    const reportedDownloadErrorRef = useRef<DocumentsActionData | null>(null);
    const deleting = deleteFetcher.state !== "idle";
    const downloading = downloadFetcher.state !== "idle";

    useEffect(() => {
        if (downloadFetcher.state !== "idle") return;
        const data = downloadFetcher.data;
        if (data && mobileDownloadPendingRef.current) {
            mobileDownloadPendingRef.current = false;
            queueMicrotask(() => setMobileMenuOpen(false));
        }
        if (data?.ok === false && data.intent === "download-generated-cv") {
            if (reportedDownloadErrorRef.current === data) return;
            reportedDownloadErrorRef.current = data;
            onFailure(data.error ?? "The download link could not be prepared.");
            return;
        }
        if (!data?.ok || data.intent !== "download-generated-cv" || !data.uri) return;
        if (openedDownloadRef.current === data) return;
        openedDownloadRef.current = data;
        openSignedDownload(data.uri);
    }, [downloadFetcher.state, downloadFetcher.data, onFailure]);

    useEffect(() => {
        if (deleteFetcher.state !== "idle") return;
        const data = deleteFetcher.data;
        if (data?.ok === false && data.intent === "delete-generated-cv") {
            if (reportedDeleteErrorRef.current === data) return;
            reportedDeleteErrorRef.current = data;
            onFailure(data.error ?? "The Generated CV could not be deleted.");
            return;
        }
        if (!data?.ok || data.intent !== "delete-generated-cv") return;
        if (removedAfterDeleteRef.current === data) return;
        removedAfterDeleteRef.current = data;
        onDeleted(generatedCv.generatedCvId);
    }, [
        deleteFetcher.state,
        deleteFetcher.data,
        generatedCv.generatedCvId,
        onDeleted,
        onFailure,
    ]);

    const requestDelete = () => {
        setDesktopMenuOpen(false);
        setMobileMenuOpen(false);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
        const formData = new FormData();
        formData.set("intent", "delete-generated-cv");
        formData.set("generatedCvId", String(generatedCv.generatedCvId));
        // Submit before closing: AlertDialogAction/Dialog.Close unmounts the portal
        // content on click and can prevent a nested <form> submit from firing.
        deleteFetcher.submit(formData, { method: "post", action: "/documents" });
        setDeleteDialogOpen(false);
    };

    const preview = () => {
        setMobileMenuOpen(false);
        onPreview(generatedCv);
    };

    return (
        <TooltipProvider delayDuration={0}>
            <div className="hidden items-center justify-center gap-1.5 md:flex">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            asChild
                            variant="ghost"
                            size="icon-sm"
                        >
                            <Link
                                to={`/applications/${generatedCv.applicationId}`}
                                aria-label={`Open application for ${generatedCv.originalFilename}`}
                            >
                                <Link2 aria-hidden="true" />
                            </Link>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open Application</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Preview ${generatedCv.originalFilename}`}
                            onClick={preview}
                        >
                            <Eye aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preview</TooltipContent>
                </Tooltip>
                <downloadFetcher.Form method="post" action="/documents">
                    <input type="hidden" name="intent" value="download-generated-cv" />
                    <input type="hidden" name="generatedCvId" value={generatedCv.generatedCvId} />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="submit"
                                variant="ghost"
                                size="icon-sm"
                                disabled={downloading}
                                aria-busy={downloading}
                                aria-label={`Download ${generatedCv.originalFilename}`}
                            >
                                {downloading ? (
                                    <LoaderCircle className="animate-spin" />
                                ) : (
                                    <CloudDownload />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download</TooltipContent>
                    </Tooltip>
                </downloadFetcher.Form>
                <Popover open={desktopMenuOpen} onOpenChange={setDesktopMenuOpen}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`More actions for ${generatedCv.originalFilename}`}
                                    aria-haspopup="menu"
                                >
                                    <EllipsisVertical aria-hidden="true" />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>More actions</TooltipContent>
                    </Tooltip>
                    <PopoverContent
                        role="menu"
                        aria-label={`More actions for ${generatedCv.originalFilename}`}
                        align="end"
                        className="w-40 min-w-0 bg-[#f1f2f4] p-2.5 shadow-cool-light"
                    >
                        <Button
                            type="button"
                            role="menuitem"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-red-700"
                            disabled={deleting}
                            onClick={requestDelete}
                        >
                            <Trash2 aria-hidden="true" />
                            Delete
                        </Button>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="flex justify-center md:hidden">
                <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`More actions for ${generatedCv.originalFilename} on small screens`}
                                    aria-haspopup="menu"
                                >
                                    <EllipsisVertical aria-hidden="true" />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>More actions</TooltipContent>
                    </Tooltip>
                    <PopoverContent
                        role="menu"
                        aria-label={`More actions for ${generatedCv.originalFilename} on small screens`}
                        align="end"
                        className="w-48 min-w-0 bg-[#f1f2f4] p-2.5 shadow-cool-light"
                    >
                        <Button
                            asChild
                            role="menuitem"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                        >
                            <Link
                                to={`/applications/${generatedCv.applicationId}`}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <Link2 aria-hidden="true" />
                                Open Application
                            </Link>
                        </Button>
                        <Button
                            type="button"
                            role="menuitem"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={preview}
                        >
                            <Eye aria-hidden="true" />
                            Preview
                        </Button>
                        <downloadFetcher.Form
                            method="post"
                            action="/documents"
                            className="w-full"
                            onSubmit={() => {
                                mobileDownloadPendingRef.current = true;
                            }}
                        >
                            <input type="hidden" name="intent" value="download-generated-cv" />
                            <input
                                type="hidden"
                                name="generatedCvId"
                                value={generatedCv.generatedCvId}
                            />
                            <Button
                                type="submit"
                                role="menuitem"
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start"
                                disabled={downloading}
                                aria-busy={downloading}
                            >
                                {downloading ? (
                                    <LoaderCircle className="animate-spin" />
                                ) : (
                                    <CloudDownload aria-hidden="true" />
                                )}
                                Download
                            </Button>
                        </downloadFetcher.Form>
                        <Button
                            type="button"
                            role="menuitem"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-red-700"
                            disabled={deleting}
                            onClick={requestDelete}
                        >
                            <Trash2 aria-hidden="true" />
                            Delete
                        </Button>
                    </PopoverContent>
                </Popover>
            </div>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {generatedCv.originalFilename}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            The Generated CV will be permanently deleted. Its Application,
                            Kanban state, and generation history will stay intact.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button type="button" variant="ghost" disabled={deleting}>
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            disabled={deleting}
                            onClick={confirmDelete}
                        >
                            {deleting ? (
                                <LoaderCircle className="animate-spin" />
                            ) : (
                                <Trash2 aria-hidden="true" />
                            )}
                            Delete Generated CV
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </TooltipProvider>
    );
}

function RecentFileSkeletonStrip() {
    return (
        <div className="mt-2 grid grid-cols-5 gap-2.5">
            {Array.from({ length: RECENT_GENERATED_CV_LIMIT }, (_, index) => (
                <div
                    key={index}
                    data-testid="recent-file-skeleton"
                    className="h-[52px] min-w-0 animate-pulse rounded-lg border border-light-gray bg-[#f1f2f4]"
                />
            ))}
        </div>
    );
}

function RecentFilesSkeleton() {
    return (
        <section
            aria-labelledby="recent-files-loading-heading"
            className="mb-5 min-h-[102px] rounded-[12px] bg-[#e8e8e8] px-4 py-2.5 shadow-recent-files"
        >
            <h2 id="recent-files-loading-heading" className="text-xs font-light text-dark-gray">
                Recent files
            </h2>
            <RecentFileSkeletonStrip />
        </section>
    );
}

function RecentFilesSection({
    items,
    error,
    loading,
    deletedIds,
    onPreview,
    onRetry,
}: {
    items: GeneratedCvSummary[];
    error: string | null;
    loading: boolean;
    deletedIds: Set<number>;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
    onRetry: () => void;
}) {
    const visibleItems = items
        .filter((item) => !deletedIds.has(item.generatedCvId))
        .slice(0, RECENT_GENERATED_CV_LIMIT);
    const previewOnKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        generatedCv: GeneratedCvSummary,
    ) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onPreview(generatedCv);
    };

    return (
        <section
            aria-labelledby="recent-files-heading"
            aria-busy={loading}
            className="mb-5 min-h-[102px] rounded-[12px] bg-[#e8e8e8] px-4 py-2.5 shadow-recent-files"
        >
            <h3 id="recent-files-heading" className="text-sm text-dark-gray">
                Recent files
            </h3>

            {loading && items.length === 0 && !error ? (
                <RecentFileSkeletonStrip />
            ) : error ? (
                <div className="flex h-[52px] items-center justify-between gap-3 text-xs">
                    <p role="alert" className="text-medium-gray">
                        {error}
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        onClick={onRetry}
                    >
                        {loading ? (
                            <LoaderCircle className="animate-spin" />
                        ) : null}
                        Retry
                    </Button>
                </div>
            ) : visibleItems.length === 0 ? (
                <div className="flex h-[52px] items-center gap-2.5 text-xs text-medium-gray">
                    <FileText aria-hidden="true" size={24} className="shrink-0 opacity-70" />
                    <p>
                        <span className="font-medium text-dark-gray">No Generated CVs yet</span>
                        {" · "}
                        <Link to="/generate" className="underline underline-offset-2">
                            Generate
                        </Link>
                    </p>
                </div>
            ) : (
                <div className="mt-2 grid grid-cols-5 gap-2.5">
                    {visibleItems.map((generatedCv) => (
                        <button
                            key={generatedCv.generatedCvId}
                            type="button"
                            aria-label={`Preview ${generatedCv.originalFilename} from Recent files`}
                            title={generatedCv.originalFilename}
                            onClick={() => onPreview(generatedCv)}
                            onKeyDown={(event) => previewOnKeyDown(event, generatedCv)}
                            className="flex h-[52px] min-w-0 items-center gap-2.5 rounded-lg border border-light-gray bg-[#f1f2f4] px-2.5 text-left outline-none transition-colors hover:border-medium-gray hover:bg-white focus-visible:ring-2 focus-visible:ring-dark-accent"
                        >
                            <FileText
                                aria-hidden="true"
                                size={24}
                                className="shrink-0 text-dark-gray"
                            />
                            <span className="min-w-0">
                                <span className="block truncate text-sm text-dark-gray">
                                    {generatedCv.originalFilename}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-medium-gray">
                                    {formatDate(generatedCv.createdAt)} ·{" "}
                                    {formatBytes(generatedCv.byteSize)}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

function BaseCvSection({
    items,
    error,
    onPreview,
}: {
    items: BaseCv[];
    error: string | null;
    onPreview: (baseCv: BaseCv) => void;
}) {
    const uploadFetcher = useFetcher<DocumentsActionData>();
    const revalidator = useRevalidator();
    const location = useLocation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const handledUploadRef = useRef<DocumentsActionData | null>(null);
    const [clientError, setClientError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [failureToast, setFailureToast] = useState<{ id: number; message: string } | null>(null);
    const nextToastIdRef = useRef(0);
    const uploading = uploadFetcher.state !== "idle";
    const atLimit = error == null && items.length >= MAX_BASE_CVS;
    const normalizedState = normalizeDocumentsState(location.search);
    const urlState: Extract<DocumentsUrlState, { tab: "base" }> =
        normalizedState.tab === "base"
            ? normalizedState
            : (defaultDocumentsState("base") as Extract<DocumentsUrlState, { tab: "base" }>);
    const uploadError =
        uploadFetcher.state === "idle" && uploadFetcher.data?.ok === false
            ? uploadFetcher.data.error
            : null;
    const visibleUploadError = clientError ?? uploadError;

    const navigateToState = useCallback(
        (nextState: Extract<DocumentsUrlState, { tab: "base" }>) => {
            void navigate(
                {
                    pathname: location.pathname,
                    search: serializeDocumentsState(nextState),
                    hash: location.hash,
                },
                { replace: true },
            );
        },
        [location.hash, location.pathname, navigate],
    );

    useEffect(() => {
        if (uploadFetcher.state !== "idle") return;
        const data = uploadFetcher.data;
        if (!data?.ok || data.intent !== "upload") return;
        if (handledUploadRef.current === data) return;
        handledUploadRef.current = data;
        setClientError(null);
        navigateToState(
            defaultDocumentsState("base") as Extract<DocumentsUrlState, { tab: "base" }>,
        );
    }, [uploadFetcher.state, uploadFetcher.data, navigateToState]);

    const showFailureToast = useCallback((message: string) => {
        nextToastIdRef.current += 1;
        setFailureToast({ id: nextToastIdRef.current, message });
    }, []);

    const upload = (file: File | undefined) => {
        setClientError(null);
        if (!file) {
            setClientError("Choose one file to upload.");
            return;
        }
        const extensionIndex = file.name.lastIndexOf(".");
        const extension = extensionIndex >= 0 ? file.name.slice(extensionIndex).toLowerCase() : "";
        if (!acceptedExtensions.includes(extension)) {
            setClientError("Choose a PDF, DOCX, or Markdown file.");
            return;
        }
        if (file.size > MAX_BYTES) {
            setClientError("The file is larger than the 10 MB limit.");
            return;
        }
        const formData = new FormData();
        formData.set("intent", "upload");
        formData.set("file", file);
        uploadFetcher.submit(formData, {
            method: "post",
            action: "/documents",
            encType: "multipart/form-data",
        });
    };

    const onChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 1) {
            setClientError("Choose one file at a time.");
        } else {
            upload(files?.[0]);
        }
        event.target.value = "";
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        if (uploading || atLimit) return;
        if (event.dataTransfer.files.length !== 1) {
            setClientError("Drop one file at a time.");
            return;
        }
        upload(event.dataTransfer.files[0]);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if ((event.key === "Enter" || event.key === " ") && !uploading && !atLimit) {
            event.preventDefault();
            inputRef.current?.click();
        }
    };

    const sortedItems = useMemo(() => {
        const multiplier = urlState.direction === "asc" ? 1 : -1;
        return [...items].sort((left, right) => {
            let result: number;
            if (urlState.sort === "name") {
                result = filenameWithoutExtension(left.originalFilename).localeCompare(
                    filenameWithoutExtension(right.originalFilename),
                    "en",
                    { sensitivity: "base" },
                );
            } else if (urlState.sort === "type") {
                result = formatLabels[left.format].localeCompare(formatLabels[right.format], "en");
            } else if (urlState.sort === "size") {
                result = left.byteSize - right.byteSize;
            } else {
                result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
            }
            if (result !== 0) return result * multiplier;
            return (left.baseCvId - right.baseCvId) * multiplier;
        });
    }, [items, urlState.direction, urlState.sort]);

    const firstIndex = (urlState.page - 1) * BASE_CV_PAGE_SIZE;
    const pageItems = sortedItems.slice(firstIndex, firstIndex + BASE_CV_PAGE_SIZE);

    const sort = (sortKey: BaseSortKey) => {
        const nextDirection = nextSortDirection(urlState.sort, urlState.direction, sortKey);
        navigateToState({ ...urlState, page: 1, sort: sortKey, direction: nextDirection });
    };

    const columns: DocumentTableColumn<BaseCv, BaseSortKey>[] = [
        {
            key: "name",
            label: "Name",
            sortable: true,
            className: "w-[30%]",
            render: (baseCv) => filenameWithoutExtension(baseCv.originalFilename),
        },
        {
            key: "type",
            label: "Type",
            sortable: true,
            className: "w-[15%]",
            render: (baseCv) => formatLabels[baseCv.format],
        },
        {
            key: "size",
            label: "Size",
            sortable: true,
            className: "w-[15%]",
            render: (baseCv) => formatBytes(baseCv.byteSize),
        },
        {
            key: "uploaded",
            label: "Uploaded",
            sortable: true,
            className: "w-[22%]",
            render: (baseCv) => formatDate(baseCv.createdAt),
        },
        {
            key: "actions",
            label: "Actions",
            className: "w-[18%]",
            cellClassName:
                "sticky right-0 z-10 bg-[#f1f2f4] md:static md:bg-transparent",
            render: (baseCv) => (
                <BaseCvActions
                    baseCv={baseCv}
                    onPreview={onPreview}
                    onFailure={showFailureToast}
                />
            ),
        },
    ];

    const dropZoneState = visibleUploadError
        ? "border-red-600 bg-red-50"
        : atLimit
            ? "cursor-not-allowed border-amber-600 bg-amber-50"
            : uploading
                ? "cursor-wait border-dark-accent bg-lightest-accent"
                : dragging
                    ? "border-dark-accent bg-lightest-accent ring-2 ring-dark-accent/20"
                    : "cursor-pointer border-dark-accent bg-[#e8e8e8] hover:bg-lightest-accent";

    return (
        <ToastProvider swipeDirection="right">
            <section aria-labelledby="base-cvs-heading" className="rounded-[12px] py-3">
                <h2 id="base-cvs-heading" className="sr-only">
                    Base CVs
                </h2>
                <div
                    role="button"
                    tabIndex={atLimit || uploading ? -1 : 0}
                    aria-disabled={atLimit || uploading}
                    aria-label="Upload a Base CV"
                    onClick={() => !atLimit && !uploading && inputRef.current?.click()}
                    onKeyDown={onKeyDown}
                    onDragEnter={(event) => {
                        event.preventDefault();
                        if (!atLimit && !uploading) setDragging(true);
                    }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        if (!atLimit && !uploading) setDragging(true);
                    }}
                    onDragLeave={(event) => {
                        const relatedTarget = event.relatedTarget;
                        if (
                            !(relatedTarget instanceof Node) ||
                            !event.currentTarget.contains(relatedTarget)
                        ) {
                            setDragging(false);
                        }
                    }}
                    onDrop={onDrop}
                    className={`flex min-h-40 flex-col items-center justify-center rounded-[12px] border border-dashed p-5 text-center transition-colors ${dropZoneState}`}
                >
                    {uploading ? (
                        <LoaderCircle className="mb-3 animate-spin text-dark-accent" size={32} />
                    ) : (
                        <UploadCloud className="mb-3 text-dark-accent" size={32} />
                    )}
                    <div className="mb-3 flex justify-end">
                        <p className="text-sm font-semibold text-darkest-accent" aria-live="polite">
                            {error == null
                                ? `${items.length} of ${MAX_BASE_CVS} Base CVs`
                                : "Base CV quota unavailable"}
                        </p>
                    </div>
                    <p className="font-semibold text-dark-gray">
                        {uploading
                            ? "Uploading Base CV…"
                            : atLimit
                                ? "Base CV limit reached"
                                : dragging
                                    ? "Drop your file to upload"
                                    : "Drop one file here or choose a file"}
                    </p>
                    <p className="mt-1 text-sm text-medium-gray">
                        PDF, Markdown or DOCX · 10 MB maximum
                    </p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf,.docx,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                        onChange={onChange}
                        disabled={atLimit || uploading}
                        className="sr-only"
                        tabIndex={-1}
                    />
                </div>
                <div className="min-h-9 py-2" aria-live="polite">
                    {atLimit ? (
                        <p className="text-sm text-amber-800">
                            Delete a Base CV to make room for another upload.
                        </p>
                    ) : visibleUploadError ? (
                        <p role="alert" className="text-sm text-red-700">
                            {visibleUploadError}
                        </p>
                    ) : uploading ? (
                        <p role="status" className="text-sm text-darkest-accent">
                            Upload in progress.
                        </p>
                    ) : null}
                </div>

                <DocumentTable
                    label="Base CVs"
                    columns={columns}
                    rows={pageItems}
                    rowKey={(baseCv) => baseCv.baseCvId}
                    sortKey={urlState.sort}
                    direction={urlState.direction}
                    onSort={sort}
                    page={urlState.page}
                    pageSize={BASE_CV_PAGE_SIZE}
                    total={items.length}
                    onPageChange={(page) => navigateToState({ ...urlState, page })}
                    error={error}
                    onRetry={() => revalidator.revalidate()}
                    retrying={revalidator.state !== "idle"}
                    empty={
                        <div className="flex flex-col items-center text-medium-gray">
                            <File className="mb-2.5 opacity-70" size={32} />
                            <h3 className="text-sm font-semibold text-dark-gray">No Base CVs yet</h3>
                            <p className="mt-1 max-w-md text-sm">
                                Upload a source document to make it available for future CV Generation.
                            </p>
                        </div>
                    }
                />
            </section>
            <Toast
                key={failureToast?.id ?? 0}
                open={failureToast != null}
                onOpenChange={(open) => {
                    if (!open) setFailureToast(null);
                }}
                duration={6000}
                role="alert"
            >
                <ToastTitle>Document action failed</ToastTitle>
                <ToastDescription>{failureToast?.message}</ToastDescription>
            </Toast>
            <ToastViewport />
        </ToastProvider>
    );
}

function GeneratedCvSection({
    items,
    total,
    error,
    recentGeneratedCvs,
    onPreview,
}: {
    items: GeneratedCvSummary[];
    total: number;
    error: string | null;
    recentGeneratedCvs: RecentGeneratedCvsData;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const recentFetcher = useFetcher<RecentGeneratedCvsData>();
    // Keep Retry fetcher data only while the parent recent loader is still in error.
    const recent =
        recentGeneratedCvs.error != null && recentFetcher.data != null
            ? recentFetcher.data
            : recentGeneratedCvs;
    const [deletedIds, setDeletedIds] = useState<Set<number>>(() => new Set());
    const [optimisticRemoved, setOptimisticRemoved] = useState(0);
    const syncedTotalRef = useRef(total);
    const [failureToast, setFailureToast] = useState<{ id: number; message: string } | null>(null);
    const nextToastIdRef = useRef(0);
    const normalizedState = normalizeDocumentsState(location.search);
    const urlState: Extract<DocumentsUrlState, { tab: "generated" }> =
        normalizedState.tab === "generated"
            ? normalizedState
            : (defaultDocumentsState("generated") as Extract<
                DocumentsUrlState,
                { tab: "generated" }
            >);
    const targetState = navigation.location
        ? normalizeDocumentsState(navigation.location.search)
        : null;
    const pending =
        navigation.state !== "idle" &&
        targetState?.tab === "generated";
    const visibleItems = items.filter((item) => !deletedIds.has(item.generatedCvId));
    const visibleTotal = Math.max(0, total - optimisticRemoved);
    const showFailureToast = useCallback((message: string) => {
        nextToastIdRef.current += 1;
        setFailureToast({ id: nextToastIdRef.current, message });
    }, []);

    useEffect(() => {
        if (syncedTotalRef.current === total) return;
        syncedTotalRef.current = total;
        setOptimisticRemoved(0);
    }, [total]);

    const handleDeleted = (generatedCvId: number) => {
        setDeletedIds((previous) => new Set(previous).add(generatedCvId));
        setOptimisticRemoved((count) => count + 1);
    };

    const navigateToState = (
        nextState: Extract<DocumentsUrlState, { tab: "generated" }>,
    ) => {
        void navigate(
            {
                pathname: location.pathname,
                search: serializeDocumentsState(nextState),
                hash: location.hash,
            },
            { replace: true },
        );
    };

    const sort = (sortKey: GeneratedSortKey) => {
        const nextDirection = nextSortDirection(urlState.sort, urlState.direction, sortKey);
        navigateToState({
            ...urlState,
            page: 1,
            sort: sortKey,
            direction: nextDirection,
        });
    };

    const columns: DocumentTableColumn<GeneratedCvSummary, GeneratedSortKey>[] = [
        {
            key: "name",
            label: "Name",
            sortable: true,
            className: "w-[21%]",
            render: (generatedCv) => filenameWithoutExtension(generatedCv.originalFilename),
        },
        {
            key: "type",
            label: "Type",
            sortable: true,
            className: "w-[9%]",
            render: (generatedCv) => formatLabels[generatedCv.format],
        },
        {
            key: "size",
            label: "Size",
            sortable: true,
            className: "w-[9%]",
            render: (generatedCv) => formatBytes(generatedCv.byteSize),
        },
        {
            key: "created",
            label: "Created",
            sortable: true,
            className: "w-[19%]",
            render: (generatedCv) => formatDate(generatedCv.createdAt),
        },
        {
            key: "version",
            label: "Version",
            sortable: true,
            className: "w-[10%]",
            render: (generatedCv) => generatedCv.version,
        },
        {
            key: "company",
            label: "Company",
            sortable: true,
            className: "w-[14%]",
            render: (generatedCv) => generatedCv.companyName,
        },
        {
            key: "actions",
            label: "Actions",
            className: "max-w-[80px] md:w-[18%]",
            headerClassName: "[padding-inline:10px] md:[padding-inline:24px]",
            cellClassName:
                "sticky right-0 z-10 bg-[#f1f2f4] md:static md:bg-transparent",
            render: (generatedCv) => (
                <GeneratedCvActions
                    generatedCv={generatedCv}
                    onPreview={onPreview}
                    onFailure={showFailureToast}
                    onDeleted={handleDeleted}
                />
            ),
        },
    ];

    return (
        <ToastProvider swipeDirection="right">
            <section
                aria-labelledby="generated-cvs-heading"
                className="rounded-[12px] py-3"
            >
                <h2 id="generated-cvs-heading" className="sr-only">
                    Generated CVs
                </h2>

                <RecentFilesSection
                    items={recent.items}
                    error={recent.error}
                    loading={recentFetcher.state !== "idle"}
                    deletedIds={deletedIds}
                    onPreview={onPreview}
                    onRetry={() => recentFetcher.load("/resources/documents/recent")}
                />

                <DocumentTable
                    label="Generated CVs"
                    columns={columns}
                    rows={visibleItems}
                    rowKey={(generatedCv) => generatedCv.generatedCvId}
                    sortKey={urlState.sort}
                    direction={urlState.direction}
                    onSort={sort}
                    page={urlState.page}
                    pageSize={GENERATED_CV_PAGE_SIZE}
                    total={visibleTotal}
                    onPageChange={(page) => navigateToState({ ...urlState, page })}
                    error={error}
                    onRetry={() => revalidator.revalidate()}
                    retrying={revalidator.state !== "idle"}
                    pending={pending}
                    empty={
                        <div className="flex flex-col items-center text-medium-gray">
                            <File className="mb-2.5 opacity-70" size={32} />
                            <h3 className="text-sm font-semibold text-dark-gray">No Generated CVs yet</h3>
                            <p className="mt-1 max-w-md text-sm">
                                Create tailored documents from{" "}
                                <Link to="/generate" className="underline underline-offset-2">
                                    Generate
                                </Link>
                                .
                            </p>
                        </div>
                    }
                />
            </section>
            <Toast
                key={failureToast?.id ?? 0}
                open={failureToast != null}
                onOpenChange={(open) => {
                    if (!open) setFailureToast(null);
                }}
                duration={6000}
                role="alert"
            >
                <ToastTitle>Document action failed</ToastTitle>
                <ToastDescription>{failureToast?.message}</ToastDescription>
            </Toast>
            <ToastViewport />
        </ToastProvider>
    );
}

export function DocumentsRouteHydrateFallback() {
    return (
        <div className="h-full overflow-y-auto px-4 pb-12 pt-3 sm:px-6 sm:pt-5">
            <div className="mx-auto w-full max-w-[1440px] rounded-[12px] bg-[#e8e8e8] p-4 shadow-cool-light-inner sm:p-6">
                <div
                    aria-hidden="true"
                    className="mb-5 h-10 w-full max-w-[440px] animate-pulse rounded-[12px] bg-[#f1f2f4] shadow-cool-light"
                />
                <RecentFilesSkeleton />
                <div
                    aria-hidden="true"
                    className="h-[560px] animate-pulse rounded-[12px] bg-[#f1f2f4] shadow-cool-light"
                />
            </div>
        </div>
    );
}

export function DocumentsRoute() {
    const { baseCvs, baseCvsError, generatedCvs, generatedCvsTotal, generatedCvsError } =
        useLoaderData() as DocumentsLoaderData;
    const recentGeneratedCvs = useRouteLoaderData(
        DOCUMENTS_RECENT_ROUTE_ID,
    ) as RecentGeneratedCvsData;
    const previewDownloadFetcher = useFetcher<DocumentsActionData>();
    const location = useLocation();
    const navigate = useNavigate();
    const openedPreviewDownloadRef = useRef<DocumentsActionData | null>(null);
    const [previewDocument, setPreviewDocument] = useState<PreviewableDocument | null>(null);
    const urlState = normalizeDocumentsState(location.search);

    const loadPreview = useCallback(
        (signal: AbortSignal) => {
            if (!previewDocument) {
                return Promise.reject(new Error("No document selected."));
            }
            if (previewDocument.source === "generated-cv") {
                return api.getGeneratedCvPreview(previewDocument.id, signal);
            }
            return api.getBaseCvPreview(previewDocument.id, signal);
        },
        [previewDocument],
    );

    useEffect(() => {
        if (previewDownloadFetcher.state !== "idle") return;
        const data = previewDownloadFetcher.data;
        if (!data?.ok || !data.uri) return;
        if (data.intent !== "download" && data.intent !== "download-generated-cv") return;
        if (openedPreviewDownloadRef.current === data) return;
        openedPreviewDownloadRef.current = data;
        openSignedDownload(data.uri);
    }, [previewDownloadFetcher.state, previewDownloadFetcher.data]);

    const openBaseCvPreview = (baseCv: BaseCv) => {
        setPreviewDocument({
            id: baseCv.baseCvId,
            filename: baseCv.originalFilename,
            format: baseCv.format,
            source: "base-cv",
        });
    };

    const openGeneratedCvPreview = (generatedCv: GeneratedCvSummary) => {
        setPreviewDocument({
            id: generatedCv.generatedCvId,
            filename: generatedCv.originalFilename,
            format: generatedCv.format,
            source: "generated-cv",
        });
    };

    const downloadPreviewOriginal = () => {
        if (!previewDocument) return;
        const formData = new FormData();
        if (previewDocument.source === "generated-cv") {
            formData.set("intent", "download-generated-cv");
            formData.set("generatedCvId", String(previewDocument.id));
        } else {
            formData.set("intent", "download");
            formData.set("baseCvId", String(previewDocument.id));
        }
        previewDownloadFetcher.submit(formData, { method: "post", action: "/documents" });
    };

    const changeTab = (value: string) => {
        if (value !== "generated" && value !== "base") return;
        if (value === urlState.tab) return;
        void navigate(
            {
                pathname: location.pathname,
                search: serializeDocumentsState(defaultDocumentsState(value)),
                hash: location.hash,
            },
            { replace: false },
        );
    };

    return (
        <div className="h-full overflow-y-auto px-4 pb-12 pt-3 sm:px-6 sm:pt-5">
            <h1 className="sr-only">Documents</h1>
            <Tabs.Root
                value={urlState.tab}
                onValueChange={changeTab}
                orientation="horizontal"
                activationMode="manual"
                className="mx-auto w-full max-w-[1440px] rounded-[12px] bg-[#e8e8e8] p-4 shadow-cool-light-inner sm:p-6"
            >
                <div className="mb-4 flex w-full sm:w-fit max-w-full items-center gap-2.5 rounded-[12px] border border-light-gray bg-[#f1f2f4] p-1.5 shadow-cool-light sm:mb-4">
                    <span className="hidden sm:inline-block shrink-0 px-2.5 font-display text-base text-dark-gray">
                        Your Documents
                    </span>
                    <span aria-hidden="true" className="hidden sm:inline-block h-8 w-px shrink-0 bg-light-gray" />
                    <Tabs.List
                        aria-label="Your Documents"
                        className="flex min-w-0 w-full sm:w-auto items-center rounded-md bg-[#d9d9d9] p-1 shadow-inner"
                    >
                        <Tabs.Trigger
                            value="generated"
                            className="flex justify-center sm:justify-start h-8 min-w-0 w-full sm:w-auto items-center gap-2 rounded px-2.5 font-display text-base text-medium-gray outline-none transition-colors hover:text-dark-gray focus-visible:ring-2 focus-visible:ring-dark-accent data-[state=active]:bg-[#f1f2f4] data-[state=active]:text-darkest-accent data-[state=active]:shadow-light sm:px-3.5"
                        >
                            <Files aria-hidden="true" size={16} className="shrink-0" />
                            <span className="truncate w-full">Generated CVs</span>
                        </Tabs.Trigger>
                        <Tabs.Trigger
                            value="base"
                            className="flex justify-center sm:justify-start h-8 min-w-0 w-full sm:w-auto items-center gap-2 rounded px-2.5 font-display text-base text-medium-gray outline-none transition-colors hover:text-dark-gray focus-visible:ring-2 focus-visible:ring-dark-accent data-[state=active]:bg-[#f1f2f4] data-[state=active]:text-darkest-accent data-[state=active]:shadow-light sm:px-3.5"
                        >
                            <FileText aria-hidden="true" size={16} className="shrink-0" />
                            <span className="truncate">Base CVs</span>
                        </Tabs.Trigger>
                    </Tabs.List>
                </div>

                <Tabs.Content
                    value="generated"
                    className="outline-none focus-visible:ring-2 focus-visible:ring-dark-accent"
                >
                    <GeneratedCvSection
                        items={generatedCvs}
                        total={generatedCvsTotal}
                        error={generatedCvsError}
                        recentGeneratedCvs={recentGeneratedCvs}
                        onPreview={openGeneratedCvPreview}
                    />
                </Tabs.Content>

                <Tabs.Content
                    value="base"
                    className="outline-none focus-visible:ring-2 focus-visible:ring-dark-accent"
                >
                    <BaseCvSection
                        items={baseCvs}
                        error={baseCvsError ?? null}
                        onPreview={openBaseCvPreview}
                    />
                </Tabs.Content>
            </Tabs.Root>

            <DocumentPreviewDialog
                document={previewDocument}
                open={previewDocument != null}
                onOpenChange={(open) => {
                    if (!open) setPreviewDocument(null);
                }}
                loadPreview={loadPreview}
                onDownloadOriginal={downloadPreviewOriginal}
            />
        </div>
    );
}
