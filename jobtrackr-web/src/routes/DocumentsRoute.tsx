import {
    CloudDownload,
    Download,
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
    AlertDialogAction,
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
    GENERATED_CV_PAGE_SIZE,
    normalizeDocumentsState,
    serializeDocumentsState,
    type DocumentsActionData,
    type DocumentsLoaderData,
    type DocumentsUrlState,
    type GeneratedSortKey,
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

const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const openSignedDownload = (uri: string) => {
    const link = document.createElement("a");
    link.href = uri;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.click();
};

function BaseCvRow({
    baseCv,
    onPreview,
}: {
    baseCv: BaseCv;
    onPreview: (baseCv: BaseCv) => void;
}) {
    const deleteFetcher = useFetcher<DocumentsActionData>();
    const downloadFetcher = useFetcher<DocumentsActionData>();
    const openedDownloadRef = useRef<DocumentsActionData | null>(null);
    const deleting = deleteFetcher.state !== "idle";
    const downloading = downloadFetcher.state !== "idle";

    useEffect(() => {
        if (downloadFetcher.state !== "idle") return;
        const data = downloadFetcher.data;
        if (!data?.ok || data.intent !== "download" || !data.uri) return;
        if (openedDownloadRef.current === data) return;
        openedDownloadRef.current = data;
        openSignedDownload(data.uri);
    }, [downloadFetcher.state, downloadFetcher.data]);

    const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
        if (!window.confirm(`Permanently delete ${baseCv.originalFilename}?`)) event.preventDefault();
    };

    const openPreview = () => onPreview(baseCv);
    const onPreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPreview();
        }
    };

    return (
        <li className="rounded-xl border border-light-gray bg-white p-4">
            <div className="flex items-start gap-3">
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview ${baseCv.originalFilename}`}
                    onClick={openPreview}
                    onKeyDown={onPreviewKeyDown}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-dark-accent"
                >
                    <div className="rounded-lg bg-lightest-accent p-2 text-dark-accent">
                        <FileText aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                        <p className="truncate font-semibold text-dark-gray">{baseCv.originalFilename}</p>
                        <p className="mt-1 text-sm text-medium-gray">
                            {formatLabels[baseCv.format]} · {formatBytes(baseCv.byteSize)} ·{" "}
                            {formatDate(baseCv.createdAt)}
                        </p>
                    </div>
                </div>
                <div className="flex gap-1">
                    <downloadFetcher.Form method="post" action="/documents">
                        <input type="hidden" name="intent" value="download" />
                        <input type="hidden" name="baseCvId" value={baseCv.baseCvId} />
                        <Button
                            type="submit"
                            variant="ghost"
                            disabled={downloading}
                            aria-label={`Download ${baseCv.originalFilename}`}
                        >
                            {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
                        </Button>
                    </downloadFetcher.Form>
                    <deleteFetcher.Form method="post" action="/documents" onSubmit={confirmDelete}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="baseCvId" value={baseCv.baseCvId} />
                        <Button
                            type="submit"
                            variant="ghost"
                            disabled={deleting}
                            aria-label={`Delete ${baseCv.originalFilename}`}
                        >
                            {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                        </Button>
                    </deleteFetcher.Form>
                </div>
            </div>
            {downloadFetcher.data?.ok === false ? (
                <p role="alert" className="mt-2 text-sm text-red-700">
                    {downloadFetcher.data.error}
                </p>
            ) : null}
            {deleteFetcher.data?.ok === false ? (
                <p role="alert" className="mt-2 text-sm text-red-700">
                    {deleteFetcher.data.error}
                </p>
            ) : null}
        </li>
    );
}

function GeneratedCvActions({
    generatedCv,
    onPreview,
    onDeleted,
    onFailure,
    returnTo,
}: {
    generatedCv: GeneratedCvSummary;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
    onDeleted: (generatedCvId: number) => void;
    onFailure: (message: string) => void;
    returnTo: string;
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

    const preview = () => {
        setMobileMenuOpen(false);
        onPreview(generatedCv);
    };

    return (
        <TooltipProvider delayDuration={0}>
            <div className="hidden items-center justify-center gap-1 md:flex">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            asChild
                            variant="ghost"
                            size="icon-sm"
                        >
                            <Link
                                to={`/applications/${generatedCv.applicationId}`}
                                state={{ returnTo }}
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
                        className="w-36 min-w-0 bg-[#f1f2f4] p-2 shadow-cool-light"
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
                        className="w-44 min-w-0 bg-[#f1f2f4] p-2 shadow-cool-light"
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
                                state={{ returnTo }}
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
                        <deleteFetcher.Form
                            method="post"
                            action="/documents"
                            onSubmit={() => setDeleteDialogOpen(false)}
                        >
                            <input type="hidden" name="intent" value="delete-generated-cv" />
                            <input
                                type="hidden"
                                name="generatedCvId"
                                value={generatedCv.generatedCvId}
                            />
                            <AlertDialogAction asChild>
                                <Button type="submit" disabled={deleting}>
                                    {deleting ? (
                                        <LoaderCircle className="animate-spin" />
                                    ) : (
                                        <Trash2 aria-hidden="true" />
                                    )}
                                    Delete Generated CV
                                </Button>
                            </AlertDialogAction>
                        </deleteFetcher.Form>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </TooltipProvider>
    );
}

function GeneratedCvSection({
    items,
    total,
    error,
    onPreview,
}: {
    items: GeneratedCvSummary[];
    total: number;
    error: string | null;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const [deletedIds, setDeletedIds] = useState<Set<number>>(() => new Set());
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
    const showFailureToast = useCallback((message: string) => {
        nextToastIdRef.current += 1;
        setFailureToast({ id: nextToastIdRef.current, message });
    }, []);

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
        const nextDirection =
            urlState.sort === sortKey
                ? urlState.direction === "asc"
                    ? "desc"
                    : "asc"
                : "asc";
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
            className: "max-w-[72px] md:w-[18%]",
            headerClassName: "[padding-inline:8px] md:[padding-inline:20px]",
            cellClassName:
                "sticky right-0 z-10 bg-[#f1f2f4] md:static md:bg-transparent",
            render: (generatedCv) => (
                <GeneratedCvActions
                    generatedCv={generatedCv}
                    onPreview={onPreview}
                    onFailure={showFailureToast}
                    returnTo={`${location.pathname}${location.search}${location.hash}`}
                    onDeleted={(generatedCvId) =>
                        setDeletedIds((previous) => new Set(previous).add(generatedCvId))
                    }
                />
            ),
        },
    ];

    return (
        <ToastProvider swipeDirection="right">
            <section
                aria-labelledby="generated-cvs-heading"
                className="rounded-[10px] py-4 px-0 sm:p-6"
            >
                <h2 id="generated-cvs-heading" className="sr-only">
                    Generated CVs
                </h2>

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
                total={total}
                onPageChange={(page) => navigateToState({ ...urlState, page })}
                error={error}
                onRetry={() => revalidator.revalidate()}
                retrying={revalidator.state !== "idle"}
                pending={pending}
                empty={
                    <div className="flex flex-col items-center text-medium-gray">
                    <File className="mb-2 opacity-70" size={28} />
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

export function DocumentsRoute() {
    const { baseCvs, generatedCvs, generatedCvsTotal, generatedCvsError } =
        useLoaderData() as DocumentsLoaderData;
    const uploadFetcher = useFetcher<DocumentsActionData>();
    const previewDownloadFetcher = useFetcher<DocumentsActionData>();
    const location = useLocation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const openedPreviewDownloadRef = useRef<DocumentsActionData | null>(null);
    const [clientError, setClientError] = useState<string | null>(null);
    const [previewDocument, setPreviewDocument] = useState<PreviewableDocument | null>(null);
    const uploading = uploadFetcher.state !== "idle";
    const atLimit = baseCvs.length >= MAX_BASE_CVS;
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

    const upload = (file: File | undefined) => {
        setClientError(null);
        if (!file) return;
        const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
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
        upload(event.target.files?.[0]);
        event.target.value = "";
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.dataTransfer.files.length > 1) {
            setClientError("Drop one file at a time.");
            return;
        }
        if (!uploading && !atLimit) upload(event.dataTransfer.files[0]);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if ((event.key === "Enter" || event.key === " ") && !uploading && !atLimit) {
            event.preventDefault();
            inputRef.current?.click();
        }
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
        <div className="h-full overflow-y-auto px-3 pb-12 pt-2 sm:px-4 sm:pt-5">
            <h1 className="sr-only">Documents</h1>
            <Tabs.Root
                value={urlState.tab}
                onValueChange={changeTab}
                orientation="horizontal"
                activationMode="manual"
                className="mx-auto w-full max-w-[1400px] rounded-[10px] border border-light-gray bg-[#e8e8e8] p-3 shadow-cool-light-inner sm:p-6"
            >
                <div className="mb-4 flex w-full sm:w-fit max-w-full items-center gap-2 rounded-[10px] border border-light-gray bg-[#f1f2f4] p-1.5 shadow-cool-light sm:mb-6">
                    <span className="hidden sm:inline-block shrink-0 px-2 font-display text-base text-dark-gray">
                        Your Documents
                    </span>
                    <span aria-hidden="true" className="hidden sm:inline-block h-7 w-px shrink-0 bg-light-gray" />
                    <Tabs.List
                        aria-label="Your Documents"
                        className="flex min-w-0 w-full sm:w-auto items-center rounded-md bg-[#d9d9d9] p-1 shadow-inner"
                    >
                        <Tabs.Trigger
                            value="generated"
                            className="flex justify-center sm:justify-start h-7 min-w-0 w-full sm:w-auto items-center gap-1.5 rounded px-2 font-display text-base text-medium-gray outline-none transition-colors hover:text-dark-gray focus-visible:ring-2 focus-visible:ring-dark-accent data-[state=active]:bg-[#f1f2f4] data-[state=active]:text-darkest-accent data-[state=active]:shadow-light sm:px-3"
                        >
                            <Files aria-hidden="true" size={14} className="shrink-0" />
                            <span className="truncate w-full">Generated CVs</span>
                        </Tabs.Trigger>
                        <Tabs.Trigger
                            value="base"
                            className="flex justify-center sm:justify-start h-7 min-w-0 w-full sm:w-auto items-center gap-1.5 rounded px-2 font-display text-base text-medium-gray outline-none transition-colors hover:text-dark-gray focus-visible:ring-2 focus-visible:ring-dark-accent data-[state=active]:bg-[#f1f2f4] data-[state=active]:text-darkest-accent data-[state=active]:shadow-light sm:px-3"
                        >
                            <FileText aria-hidden="true" size={14} className="shrink-0" />
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
                        onPreview={openGeneratedCvPreview}
                    />
                </Tabs.Content>

                <Tabs.Content
                    value="base"
                    className="rounded-[10px] border border-light-gray bg-[#f1f2f4] p-4 shadow-cool-light outline-none focus-visible:ring-2 focus-visible:ring-dark-accent sm:p-6"
                >
                    <div className="flex justify-between gap-4">
                        <h2 className="sr-only">Base CVs</h2>
                        <p className="ml-auto shrink-0 font-semibold text-darkest-accent">
                            {baseCvs.length} / {MAX_BASE_CVS}
                        </p>
                    </div>
                    <div
                        role="button"
                        tabIndex={atLimit || uploading ? -1 : 0}
                        aria-disabled={atLimit || uploading}
                        aria-label="Upload a Base CV"
                        onClick={() => !atLimit && !uploading && inputRef.current?.click()}
                        onKeyDown={onKeyDown}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={onDrop}
                        className={`mt-2 flex min-h-40 flex-col items-center justify-center rounded-[10px] border border-dashed p-6 text-center transition-colors ${atLimit || uploading ? "cursor-not-allowed border-light-gray opacity-60" : "cursor-pointer border-dark-accent hover:bg-lightest-accent"}`}
                    >
                        {uploading ? (
                            <LoaderCircle className="mb-3 animate-spin text-dark-accent" size={32} />
                        ) : (
                            <UploadCloud className="mb-3 text-dark-accent" size={32} />
                        )}
                        <p className="font-semibold">
                            {uploading
                                ? "Uploading Base CV…"
                                : atLimit
                                    ? "Base CV limit reached"
                                    : "Drop one file here or choose a file"}
                        </p>
                        <p className="mt-1 text-sm text-medium-gray">
                            PDF, DOCX, or Markdown · 10 MB maximum
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
                    {atLimit ? (
                        <p className="mt-3 text-sm text-amber-800">
                            Delete a Base CV to make room for another upload.
                        </p>
                    ) : null}
                    {clientError ? (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                            {clientError}
                        </p>
                    ) : null}
                    {uploadFetcher.data?.ok === false ? (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                            {uploadFetcher.data.error}
                        </p>
                    ) : null}

                    {baseCvs.length === 0 ? (
                        <div className="mt-8 flex flex-col items-center py-8 text-center text-medium-gray">
                            <File className="mb-3" size={32} />
                            <h3 className="font-semibold text-dark-gray">No Base CVs yet</h3>
                            <p className="mt-1 max-w-md text-sm">
                                Upload your first CV to keep it ready for future tailored document generation.
                            </p>
                        </div>
                    ) : (
                        <ul className="mt-6 space-y-3">
                            {baseCvs.map((baseCv) => (
                                <BaseCvRow
                                    key={baseCv.baseCvId}
                                    baseCv={baseCv}
                                    onPreview={openBaseCvPreview}
                                />
                            ))}
                        </ul>
                    )}
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
