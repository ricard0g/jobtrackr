import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PdfDocumentViewer } from "@/components/documents/PdfDocumentViewer";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { BaseCvFormat } from "@/types/base-cv";

export type PreviewableDocument = {
	id: number;
	filename: string;
	format: BaseCvFormat;
};

type DocumentPreviewDialogProps = {
	document: PreviewableDocument | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	loadPreview: (signal: AbortSignal) => Promise<Blob>;
	onDownloadOriginal: () => void;
};

type PreviewState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; objectUrl: string }
	| { status: "error"; message: string }
	| { status: "unsupported" };

export function DocumentPreviewDialog({
	document: previewDocument,
	open,
	onOpenChange,
	loadPreview,
	onDownloadOriginal,
}: DocumentPreviewDialogProps) {
	const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
	const [retryNonce, setRetryNonce] = useState(0);
	const objectUrlRef = useRef<string | null>(null);

	const releaseObjectUrl = () => {
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}
	};

	useEffect(() => {
		if (!open || !previewDocument) {
			releaseObjectUrl();
			setPreview({ status: "idle" });
			return;
		}

		if (previewDocument.format !== "PDF") {
			releaseObjectUrl();
			setPreview({ status: "unsupported" });
			return;
		}

		const controller = new AbortController();
		releaseObjectUrl();
		setPreview({ status: "loading" });

		void loadPreview(controller.signal)
			.then((blob) => {
				if (controller.signal.aborted) return;
				const objectUrl = URL.createObjectURL(blob);
				objectUrlRef.current = objectUrl;
				setPreview({ status: "ready", objectUrl });
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				const message =
					error instanceof Error ? error.message : "Preview could not be loaded.";
				setPreview({ status: "error", message });
			});

		return () => {
			controller.abort();
			releaseObjectUrl();
		};
	}, [open, previewDocument, loadPreview, retryNonce]);

	const title = previewDocument?.filename ?? "Document preview";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="flex h-[90dvh] max-h-[90dvh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] flex-col gap-0 overflow-hidden p-0"
			>
				<DialogHeader className="shrink-0 border-b border-light-gray px-4 py-3 text-left">
					<DialogTitle className="truncate pr-2">{title}</DialogTitle>
					<DialogDescription className="sr-only">
						Preview of {title}
					</DialogDescription>
				</DialogHeader>

				{preview.status === "loading" || preview.status === "idle" ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-medium-gray">
						<LoaderCircle className="animate-spin" size={28} />
						<p>Loading preview…</p>
						<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
							Close
						</Button>
					</div>
				) : null}

				{preview.status === "unsupported" ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
						<p className="text-sm text-medium-gray">
							Only PDF format is previewable right now.
						</p>
						<div className="flex flex-wrap justify-center gap-2">
							<Button type="button" variant="outline" onClick={onDownloadOriginal}>
								<Download />
								Download Original
							</Button>
							<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
								Close
							</Button>
						</div>
					</div>
				) : null}

				{preview.status === "error" ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
						<p role="alert" className="text-sm text-medium-gray">
							{preview.message}
						</p>
						<div className="flex flex-wrap justify-center gap-2">
							<Button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
								Retry Preview
							</Button>
							<Button type="button" variant="outline" onClick={onDownloadOriginal}>
								<Download />
								Download Original
							</Button>
							<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
								Close
							</Button>
						</div>
					</div>
				) : null}

				{preview.status === "ready" && previewDocument ? (
					<PdfDocumentViewer
						fileUrl={preview.objectUrl}
						filename={previewDocument.filename}
						onDownloadOriginal={onDownloadOriginal}
						onRetryPreview={() => setRetryNonce((value) => value + 1)}
						onClose={() => onOpenChange(false)}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
