import { lazy, Suspense, useEffect, useId, useRef } from "react";
import type { DemoGeneratedCv } from "./demo-data";
import { DocumentButton } from "./documents/DocumentButton";

const PdfDocumentViewer = lazy(() =>
  import("./documents/PdfDocumentViewer").then((module) => ({
    default: module.PdfDocumentViewer,
  })),
);

/** Matches the app's DocumentPreviewDialog dimensions and header. */
export function GeneratedCvPreview({
  cv,
  returnFocus,
  onClose,
}: {
  cv: DemoGeneratedCv;
  returnFocus: HTMLElement;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      returnFocus.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto h-[90dvh] max-h-[90dvh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] overflow-hidden rounded-lg border border-light-gray bg-white p-0 text-dark-gray shadow-xl backdrop:bg-black/50"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-light-gray px-4 py-3 text-left">
          <h2 id={titleId} className="truncate pr-2 text-lg font-semibold">
            {cv.filename}
          </h2>
          <p className="sr-only">Preview of the supplied example PDF.</p>
        </header>
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-medium-gray">
              <p role="status">Loading preview…</p>
              <DocumentButton onClick={onClose} autoFocus>
                Close
              </DocumentButton>
            </div>
          }
        >
          <PdfDocumentViewer onClose={onClose} />
        </Suspense>
      </div>
    </dialog>
  );
}
