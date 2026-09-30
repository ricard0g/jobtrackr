import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { DemoApplication, DemoGeneratedCv } from "./demo-data";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "error" };

export function GeneratedCvPreview({
  application,
  cv,
  onClose,
}: {
  application: DemoApplication;
  cv: DemoGeneratedCv;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/demo-cvs/${cv.filename}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Local preview unavailable");
        const markdown = await response.text();
        if (!controller.signal.aborted)
          setPreview({ status: "ready", markdown });
      } catch {
        if (!controller.signal.aborted) setPreview({ status: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [cv.filename]);

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
      className="fixed inset-0 m-auto h-[calc(100dvh-1.5rem)] max-h-200 w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-card border border-light-gray bg-white p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-light-gray p-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words font-display text-base font-bold sm:text-lg"
            >
              {cv.filename}
            </h2>
            <p className="mt-1 text-xs text-medium-gray">
              {application.company} · {application.title} · v{cv.version}
            </p>
            <p className="mt-1 text-xs text-medium-gray">
              Fictional candidate · preview only
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            autoFocus
            className="shrink-0 rounded-md p-2 text-medium-gray hover:bg-off-white focus-visible:outline-2 focus-visible:outline-accent-dark"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
          {preview.status === "loading" ? (
            <p role="status">Loading preview…</p>
          ) : null}
          {preview.status === "error" ? (
            <p role="alert">
              This prepared CV could not be loaded. Close the preview and try
              again.
            </p>
          ) : null}
          {preview.status === "ready" ? (
            <article aria-label="CV content" className="demo-cv">
              <ReactMarkdown
                components={{
                  a: ({ children }) => <span>{children}</span>,
                  img: () => null,
                }}
              >
                {preview.markdown}
              </ReactMarkdown>
            </article>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
