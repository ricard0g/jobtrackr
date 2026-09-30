import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { DocumentButton } from "./DocumentButton";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const SAMPLE_PDF = "/demo-cvs/application-3-cv-v1.pdf";

/** The app's react-pdf viewer adapted to the supplied local preview-only sample. */
export function PdfDocumentViewer({ onClose }: { onClose: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fitScale =
    pageWidth && viewportWidth
      ? Math.min(1, Math.max(0.1, (viewportWidth - 32) / pageWidth))
      : 1;
  const scale = zoom ?? fitScale;
  const minScale = Math.min(0.5, fitScale);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() =>
      setViewportWidth(viewport.clientWidth),
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const loading = (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 text-medium-gray"
    >
      <LoaderCircle aria-hidden="true" className="animate-spin" />
      <span>Loading preview…</span>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-center gap-1 border-b border-light-gray px-2 py-2 sm:gap-2">
        <DocumentButton
          disabled={pageNumber <= 1 || loadError}
          aria-label="Previous page"
          onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
        >
          <ChevronLeft aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </DocumentButton>
        <p
          className="min-w-24 text-center text-sm text-medium-gray"
          aria-live="polite"
        >
          {numPages ? `Page ${pageNumber} of ${numPages}` : "Page —"}
        </p>
        <DocumentButton
          disabled={numPages === 0 || pageNumber >= numPages || loadError}
          aria-label="Next page"
          onClick={() => setPageNumber((page) => Math.min(numPages, page + 1))}
        >
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRight aria-hidden="true" />
        </DocumentButton>
        <span
          className="mx-1 hidden h-5 w-px bg-light-gray sm:block"
          aria-hidden="true"
        />
        <DocumentButton
          disabled={!numPages || loadError || scale <= minScale + 0.001}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setZoom(Math.max(minScale, scale - 0.25))}
        >
          <ZoomOut aria-hidden="true" />
        </DocumentButton>
        <DocumentButton
          disabled={!numPages || loadError || scale >= 2.5}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setZoom(Math.min(2.5, scale + 0.25))}
        >
          <ZoomIn aria-hidden="true" />
        </DocumentButton>
        <DocumentButton
          disabled={!numPages || loadError}
          aria-label="Fit to width"
          title="Fit to width"
          onClick={() => setZoom(null)}
        >
          <Maximize2 aria-hidden="true" />
        </DocumentButton>
        <span
          className="mx-1 hidden h-5 w-px bg-light-gray sm:block"
          aria-hidden="true"
        />
        <DocumentButton onClick={onClose} autoFocus>
          Close
        </DocumentButton>
      </div>
      <div
        ref={viewportRef}
        className="demo-pdf min-h-0 flex-1 overflow-auto bg-light-gray/40 p-4"
      >
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p role="alert" className="text-sm text-medium-gray">
              This PDF could not be rendered.
            </p>
            <DocumentButton
              onClick={() => {
                setLoadError(false);
                setNumPages(0);
                setPageNumber(1);
                setZoom(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry Preview
            </DocumentButton>
          </div>
        ) : (
          <Document
            key={attempt}
            file={SAMPLE_PDF}
            loading={loading}
            onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
            onLoadError={() => setLoadError(true)}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer={false}
              onLoadSuccess={(page) => setPageWidth(page.originalWidth)}
              onLoadError={() => setLoadError(true)}
              onRenderError={() => setLoadError(true)}
              loading={loading}
              className="mx-auto shadow-documents-surface"
              aria-label={`Example CV page ${pageNumber}`}
            />
          </Document>
        )}
      </div>
    </div>
  );
}
