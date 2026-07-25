import {
	ChevronLeft,
	ChevronRight,
	Download,
	LoaderCircle,
	Maximize2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.25;

type PdfDocumentViewerProps = {
	fileUrl: string;
	filename: string;
	onDownloadOriginal: () => void;
	onRetryPreview: () => void;
	onClose: () => void;
};

function secureAnnotationLinks(root: HTMLElement | null) {
	if (!root) return;
	root.querySelectorAll(".annotationLayer a").forEach((anchor) => {
		anchor.setAttribute("target", "_blank");
		anchor.setAttribute("rel", "noopener noreferrer");
	});
}

export function PdfDocumentViewer({
	fileUrl,
	filename,
	onDownloadOriginal,
	onRetryPreview,
	onClose,
}: PdfDocumentViewerProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [numPages, setNumPages] = useState(0);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(1);
	const [fitScale, setFitScale] = useState(1);
	const [pageWidth, setPageWidth] = useState<number | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [activeFileUrl, setActiveFileUrl] = useState(fileUrl);

	if (fileUrl !== activeFileUrl) {
		setActiveFileUrl(fileUrl);
		setNumPages(0);
		setPageNumber(1);
		setScale(1);
		setFitScale(1);
		setPageWidth(null);
		setLoadError(false);
	}

	useLayoutEffect(() => {
		if (!viewportRef.current || !pageWidth) return;
		const available = viewportRef.current.clientWidth - 32;
		const nextFit = Math.min(1, Math.max(MIN_SCALE, available / pageWidth));
		setFitScale(nextFit);
		setScale(nextFit);
	}, [pageWidth, activeFileUrl]);

	const atFirstPage = pageNumber <= 1;
	const atLastPage = numPages === 0 || pageNumber >= numPages;
	const atMinZoom = scale <= MIN_SCALE + 0.001;
	const atMaxZoom = scale >= MAX_SCALE - 0.001;

	if (loadError) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
				<p role="alert" className="text-sm text-medium-gray">
					This PDF could not be rendered.
				</p>
				<div className="flex flex-wrap justify-center gap-2">
					<Button type="button" onClick={onRetryPreview}>
						Retry Preview
					</Button>
					<Button type="button" variant="outline" onClick={onDownloadOriginal}>
						<Download />
						Download Original
					</Button>
					<Button type="button" variant="ghost" onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center justify-center gap-1 border-b border-light-gray px-2 py-2 sm:gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={atFirstPage}
					aria-label="Previous page"
					onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
				>
					<ChevronLeft />
					<span className="sr-only sm:not-sr-only">Previous</span>
				</Button>
				<p className="min-w-24 text-center text-sm text-medium-gray" aria-live="polite">
					{numPages > 0 ? `Page ${pageNumber} of ${numPages}` : "Page —"}
				</p>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={atLastPage}
					aria-label="Next page"
					onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))}
				>
					<span className="sr-only sm:not-sr-only">Next</span>
					<ChevronRight />
				</Button>
				<span className="mx-1 hidden h-5 w-px bg-light-gray sm:block" aria-hidden="true" />
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={atMinZoom}
					aria-label="Zoom out"
					onClick={() => setScale((current) => Math.max(MIN_SCALE, current - SCALE_STEP))}
				>
					<ZoomOut />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={atMaxZoom}
					aria-label="Zoom in"
					onClick={() => setScale((current) => Math.min(MAX_SCALE, current + SCALE_STEP))}
				>
					<ZoomIn />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					aria-label="Fit to width"
					onClick={() => setScale(fitScale)}
				>
					<Maximize2 />
				</Button>
				<span className="mx-1 hidden h-5 w-px bg-light-gray sm:block" aria-hidden="true" />
				<Button type="button" variant="ghost" size="sm" onClick={onDownloadOriginal}>
					<Download />
					<span className="sr-only sm:not-sr-only">Download Original</span>
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onClose}>
					Close
				</Button>
			</div>
			<div
				ref={viewportRef}
				className="min-h-0 flex-1 overflow-auto bg-light-gray/40 p-4"
			>
				<Document
					file={fileUrl}
					loading={
						<div className="flex items-center justify-center gap-2 py-16 text-medium-gray">
							<LoaderCircle className="animate-spin" />
							<span>Loading preview…</span>
						</div>
					}
					onLoadSuccess={({ numPages: pages }) => {
						setNumPages(pages);
						setPageNumber((current) => {
							if (current < 1) return 1;
							if (current > pages) return pages;
							return current;
						});
					}}
					onLoadError={() => setLoadError(true)}
				>
					<Page
						pageNumber={pageNumber}
						scale={scale}
						renderTextLayer
						renderAnnotationLayer
						onLoadSuccess={(page) => {
							if (pageWidth == null) {
								setPageWidth(page.originalWidth);
							}
						}}
						onRenderAnnotationLayerSuccess={() =>
							secureAnnotationLinks(viewportRef.current)
						}
						loading={
							<div className="flex items-center justify-center gap-2 py-16 text-medium-gray">
								<LoaderCircle className="animate-spin" />
								<span>Loading page…</span>
							</div>
						}
						className="mx-auto shadow-cool-light"
						aria-label={`${filename} page ${pageNumber}`}
					/>
				</Document>
			</div>
		</div>
	);
}
