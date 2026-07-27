import { Download, File, FileText, LoaderCircle, Trash2, UploadCloud } from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type KeyboardEvent,
} from "react";
import { Link, useFetcher, useLoaderData } from "react-router";

import {
    DocumentPreviewDialog,
    type PreviewableDocument,
} from "@/components/documents/DocumentPreviewDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { BaseCv } from "@/types/base-cv";
import type { GeneratedCvSummary } from "@/types/generated-cv";
import {
    GENERATED_CV_PAGE_SIZE,
    type DocumentsActionData,
    type DocumentsLoaderData,
} from "@/routes/documents-data";

const MAX_BASE_CVS = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const acceptedExtensions = [".pdf", ".docx", ".md"];
const formatLabels = { PDF: "PDF", DOCX: "DOCX", MARKDOWN: "Markdown" } as const;

const formatBytes = (bytes: number) =>
    new Intl.NumberFormat("en", {
        style: "unit",
        unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte",
        maximumFractionDigits: 1,
    }).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));

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

function GeneratedCvLibraryRow({
    generatedCv,
    onPreview,
    onDeleted,
}: {
    generatedCv: GeneratedCvSummary;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
    onDeleted: (generatedCvId: number) => void;
}) {
    const deleteFetcher = useFetcher<DocumentsActionData>();
    const downloadFetcher = useFetcher<DocumentsActionData>();
    const openedDownloadRef = useRef<DocumentsActionData | null>(null);
    const removedAfterDeleteRef = useRef<DocumentsActionData | null>(null);
    const deleting = deleteFetcher.state !== "idle";
    const downloading = downloadFetcher.state !== "idle";

    useEffect(() => {
        if (downloadFetcher.state !== "idle") return;
        const data = downloadFetcher.data;
        if (!data?.ok || data.intent !== "download-generated-cv" || !data.uri) return;
        if (openedDownloadRef.current === data) return;
        openedDownloadRef.current = data;
        openSignedDownload(data.uri);
    }, [downloadFetcher.state, downloadFetcher.data]);

    useEffect(() => {
        if (deleteFetcher.state !== "idle") return;
        const data = deleteFetcher.data;
        if (!data?.ok || data.intent !== "delete-generated-cv") return;
        if (removedAfterDeleteRef.current === data) return;
        removedAfterDeleteRef.current = data;
        onDeleted(generatedCv.generatedCvId);
    }, [deleteFetcher.state, deleteFetcher.data, generatedCv.generatedCvId, onDeleted]);

    const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
        if (!window.confirm(`Permanently delete ${generatedCv.originalFilename}?`)) {
            event.preventDefault();
        }
    };

    const openPreview = () => onPreview(generatedCv);
    const onPreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPreview();
        }
    };

    return (
        <li className="rounded-xl border border-light-gray/80 bg-white/90 p-4">
            <div className="flex items-start gap-3">
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview ${generatedCv.originalFilename}`}
                    onClick={openPreview}
                    onKeyDown={onPreviewKeyDown}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-dark-accent"
                >
                    <div className="rounded-lg bg-light-gray/60 p-2 text-medium-gray">
                        <FileText aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                        <p className="truncate font-semibold text-dark-gray">{generatedCv.originalFilename}</p>
                        <p className="mt-1 text-sm text-medium-gray">
                            {generatedCv.applicationTitle} · {generatedCv.companyName}
                        </p>
                        <p className="mt-0.5 text-sm text-medium-gray">
                            v{generatedCv.version} · {formatLabels[generatedCv.format]} ·{" "}
                            {formatBytes(generatedCv.byteSize)} · {formatDate(generatedCv.createdAt)}
                        </p>
                    </div>
                </div>
                <div className="flex gap-1">
                    <downloadFetcher.Form method="post" action="/documents">
                        <input type="hidden" name="intent" value="download-generated-cv" />
                        <input type="hidden" name="generatedCvId" value={generatedCv.generatedCvId} />
                        <Button
                            type="submit"
                            variant="ghost"
                            disabled={downloading}
                            aria-label={`Download ${generatedCv.originalFilename}`}
                        >
                            {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
                        </Button>
                    </downloadFetcher.Form>
                    <deleteFetcher.Form method="post" action="/documents" onSubmit={confirmDelete}>
                        <input type="hidden" name="intent" value="delete-generated-cv" />
                        <input type="hidden" name="generatedCvId" value={generatedCv.generatedCvId} />
                        <Button
                            type="submit"
                            variant="ghost"
                            disabled={deleting}
                            aria-label={`Delete ${generatedCv.originalFilename}`}
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

function GeneratedCvSection({
    initialItems,
    initialPage,
    initialTotal,
    initialError,
    onPreview,
}: {
    initialItems: GeneratedCvSummary[];
    initialPage: number;
    initialTotal: number;
    initialError: string | null;
    onPreview: (generatedCv: GeneratedCvSummary) => void;
}) {
    const [items, setItems] = useState(initialItems);
    const [page, setPage] = useState(initialPage);
    const [total, setTotal] = useState(initialTotal);
    const [error, setError] = useState(initialError);
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const hasMore = items.length < total;

    const removeGeneratedCv = (generatedCvId: number) => {
        setItems((previous) => previous.filter((item) => item.generatedCvId !== generatedCvId));
        setTotal((previous) => Math.max(0, previous - 1));
    };

    const loadMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        setLoadMoreError(null);
        const nextPage = page + 1;
        try {
            const response = await api.getGeneratedCvsPage({
                page: nextPage,
                size: GENERATED_CV_PAGE_SIZE,
            });
            setItems((previous) => {
                const seen = new Set(previous.map((item) => item.generatedCvId));
                const appended = response.items.filter((item) => !seen.has(item.generatedCvId));
                return [...previous, ...appended];
            });
            setPage(response.page);
            setTotal(response.total);
        } catch (loadError) {
            setLoadMoreError(
                loadError instanceof Error ? loadError.message : "Could not load more Generated CVs.",
            );
        } finally {
            setLoadingMore(false);
        }
    };

    const retry = async () => {
        if (retrying) return;
        setRetrying(true);
        try {
            const response = await api.getGeneratedCvsPage({
                page: 0,
                size: GENERATED_CV_PAGE_SIZE,
            });
            setItems(response.items);
            setPage(response.page);
            setTotal(response.total);
            setError(null);
            setLoadMoreError(null);
        } catch (loadError) {
            setError(
                loadError instanceof Error ? loadError.message : "Generated CVs could not be loaded.",
            );
        } finally {
            setRetrying(false);
        }
    };

    return (
        <section
            aria-labelledby="generated-cvs-heading"
            className="mt-8 rounded-2xl border border-light-gray bg-light-gray/25 p-4 shadow-cool-light-inner sm:p-6"
        >
            <h2 id="generated-cvs-heading" className="text-lg font-semibold text-dark-gray">
                Generated CVs
            </h2>
            <p className="mt-1 text-sm text-medium-gray">
                Role-tailored outputs from Generate, newest first.
            </p>

            {error ? (
                <div className="mt-6 rounded-xl border border-light-gray bg-white/70 px-4 py-5 text-center">
                    <p role="alert" className="text-sm text-medium-gray">
                        {error}
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        disabled={retrying}
                        onClick={() => void retry()}
                    >
                        {retrying ? <LoaderCircle className="animate-spin" /> : null}
                        Retry
                    </Button>
                </div>
            ) : items.length === 0 ? (
                <div className="mt-6 flex flex-col items-center py-6 text-center text-medium-gray">
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
            ) : (
                <>
                    <ul className="mt-5 space-y-3">
                        {items.map((generatedCv) => (
                            <GeneratedCvLibraryRow
                                key={generatedCv.generatedCvId}
                                generatedCv={generatedCv}
                                onPreview={onPreview}
                                onDeleted={removeGeneratedCv}
                            />
                        ))}
                    </ul>
                    {hasMore ? (
                        <div className="mt-4 flex flex-col items-center gap-2">
                            {loadMoreError ? (
                                <p role="alert" className="text-sm text-medium-gray">
                                    {loadMoreError}
                                </p>
                            ) : null}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={loadingMore}
                                onClick={() => void loadMore()}
                            >
                                {loadingMore ? <LoaderCircle className="animate-spin" /> : null}
                                {loadMoreError ? "Retry" : "Load more"}
                            </Button>
                        </div>
                    ) : (
                        <p className="mt-4 text-center text-xs text-medium-gray">All Generated CVs loaded</p>
                    )}
                </>
            )}
        </section>
    );
}

export function DocumentsRoute() {
    const { baseCvs, generatedCvs, generatedCvsPage, generatedCvsTotal, generatedCvsError } =
        useLoaderData() as DocumentsLoaderData;
    const uploadFetcher = useFetcher<DocumentsActionData>();
    const previewDownloadFetcher = useFetcher<DocumentsActionData>();
    const inputRef = useRef<HTMLInputElement>(null);
    const openedPreviewDownloadRef = useRef<DocumentsActionData | null>(null);
    const [clientError, setClientError] = useState<string | null>(null);
    const [previewDocument, setPreviewDocument] = useState<PreviewableDocument | null>(null);
    const uploading = uploadFetcher.state !== "idle";
    const atLimit = baseCvs.length >= MAX_BASE_CVS;

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

    return (
        <div className="h-full overflow-y-auto px-4 pb-12">
            <section className="mx-auto max-w-4xl">
                <div className="mb-6 flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-darkest-accent sm:text-3xl">Documents</h1>
                        <p className="mt-1 text-medium-gray">
                            Manage the source documents used to tailor future applications.
                        </p>
                    </div>
                </div>
                <div className="rounded-2xl border border-light-gray bg-off-white p-4 shadow-cool-light sm:p-6">
                    <div className="flex justify-between">
                        <h2 className="inline text-xl font-semibold">Base CVs</h2>
                        <p className="inline shrink-0 font-semibold text-darkest-accent">
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
                        className={`mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${atLimit || uploading ? "cursor-not-allowed border-light-gray opacity-60" : "cursor-pointer border-medium-accent hover:bg-lightest-accent"}`}
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
                        <p className="mt-1 text-sm text-medium-gray">PDF, DOCX, or Markdown · 10 MB maximum</p>
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
                </div>

                <GeneratedCvSection
                    initialItems={generatedCvs}
                    initialPage={generatedCvsPage}
                    initialTotal={generatedCvsTotal}
                    initialError={generatedCvsError}
                    onPreview={openGeneratedCvPreview}
                />
            </section>

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
