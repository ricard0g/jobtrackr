import { Download, File, FileText, LoaderCircle, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useFetcher, useLoaderData } from "react-router";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { BaseCv } from "@/types/base-cv";
import type { DocumentsActionData, DocumentsLoaderData } from "@/routes/documents-data";

const MAX_BASE_CVS = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const acceptedExtensions = [".pdf", ".docx", ".md"];
const formatLabels = { PDF: "PDF", DOCX: "DOCX", MARKDOWN: "Markdown" } as const;

const formatBytes = (bytes: number) =>
	new Intl.NumberFormat("en", { style: "unit", unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));

const formatDate = (value: string) =>
	new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function BaseCvRow({ baseCv }: { baseCv: BaseCv }) {
	const deleteFetcher = useFetcher<DocumentsActionData>();
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [downloading, setDownloading] = useState(false);
	const deleting = deleteFetcher.state !== "idle";

	const download = async () => {
		setDownloadError(null);
		setDownloading(true);
		try {
			await api.downloadBaseCv(baseCv);
		} catch (error) {
			setDownloadError(error instanceof Error ? error.message : "Download failed.");
		} finally {
			setDownloading(false);
		}
	};

	const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
		if (!window.confirm(`Permanently delete ${baseCv.originalFilename}?`)) event.preventDefault();
	};

	return (
		<li className="rounded-xl border border-light-gray bg-white p-4">
			<div className="flex items-start gap-3">
				<div className="rounded-lg bg-lightest-accent p-2 text-dark-accent"><FileText aria-hidden="true" /></div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-dark-gray">{baseCv.originalFilename}</p>
					<p className="mt-1 text-sm text-medium-gray">{formatLabels[baseCv.format]} · {formatBytes(baseCv.byteSize)} · {formatDate(baseCv.createdAt)}</p>
				</div>
				<div className="flex gap-1">
					<Button type="button" variant="ghost" onClick={download} disabled={downloading} aria-label={`Download ${baseCv.originalFilename}`}>
						{downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
					</Button>
					<deleteFetcher.Form method="post" action="/documents" onSubmit={confirmDelete}>
						<input type="hidden" name="intent" value="delete" /><input type="hidden" name="baseCvId" value={baseCv.baseCvId} />
						<Button type="submit" variant="ghost" disabled={deleting} aria-label={`Delete ${baseCv.originalFilename}`}>
							{deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
						</Button>
					</deleteFetcher.Form>
				</div>
			</div>
			{downloadError ? <p role="alert" className="mt-2 text-sm text-red-700">{downloadError}</p> : null}
			{deleteFetcher.data?.ok === false ? <p role="alert" className="mt-2 text-sm text-red-700">{deleteFetcher.data.error}</p> : null}
		</li>
	);
}

export function DocumentsRoute() {
	const { baseCvs } = useLoaderData() as DocumentsLoaderData;
	const uploadFetcher = useFetcher<DocumentsActionData>();
	const inputRef = useRef<HTMLInputElement>(null);
	const [clientError, setClientError] = useState<string | null>(null);
	const uploading = uploadFetcher.state !== "idle";
	const atLimit = baseCvs.length >= MAX_BASE_CVS;

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
		uploadFetcher.submit(formData, { method: "post", action: "/documents", encType: "multipart/form-data" });
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
				<div className="mb-6 flex items-end justify-between gap-4"><div><h1 className="text-2xl font-bold text-darkest-accent sm:text-3xl">Documents</h1><p className="mt-1 text-medium-gray">Manage the source documents used to tailor future applications.</p></div><p className="shrink-0 font-semibold text-darkest-accent">{baseCvs.length} / {MAX_BASE_CVS}</p></div>
				<div className="rounded-2xl border border-light-gray bg-off-white p-4 shadow-cool-light sm:p-6">
					<h2 className="text-xl font-semibold">Base CVs</h2>
					<div role="button" tabIndex={atLimit || uploading ? -1 : 0} aria-disabled={atLimit || uploading} aria-label="Upload a Base CV" onClick={() => !atLimit && !uploading && inputRef.current?.click()} onKeyDown={onKeyDown} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className={`mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${atLimit || uploading ? "cursor-not-allowed border-light-gray opacity-60" : "cursor-pointer border-medium-accent hover:bg-lightest-accent"}`}>
						{uploading ? <LoaderCircle className="mb-3 animate-spin text-dark-accent" size={32} /> : <UploadCloud className="mb-3 text-dark-accent" size={32} />}
						<p className="font-semibold">{uploading ? "Uploading Base CV…" : atLimit ? "Base CV limit reached" : "Drop one file here or choose a file"}</p>
						<p className="mt-1 text-sm text-medium-gray">PDF, DOCX, or Markdown · 10 MB maximum</p>
						<input ref={inputRef} type="file" accept=".pdf,.docx,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain" onChange={onChange} disabled={atLimit || uploading} className="sr-only" tabIndex={-1} />
					</div>
					{atLimit ? <p className="mt-3 text-sm text-amber-800">Delete a Base CV to make room for another upload.</p> : null}
					{clientError ? <p role="alert" className="mt-3 text-sm text-red-700">{clientError}</p> : null}
					{uploadFetcher.data?.ok === false ? <p role="alert" className="mt-3 text-sm text-red-700">{uploadFetcher.data.error}</p> : null}

					{baseCvs.length === 0 ? (
						<div className="mt-8 flex flex-col items-center py-8 text-center text-medium-gray"><File className="mb-3" size={32} /><h3 className="font-semibold text-dark-gray">No Base CVs yet</h3><p className="mt-1 max-w-md text-sm">Upload your first CV to keep it ready for future tailored document generation.</p></div>
					) : <ul className="mt-6 space-y-3">{baseCvs.map((baseCv) => <BaseCvRow key={baseCv.baseCvId} baseCv={baseCv} />)}</ul>}
				</div>
			</section>
		</div>
	);
}
