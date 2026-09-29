import { FileText, History, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { statusColumns, type DemoApplication } from "./demo-data";
import { TagBadge } from "./DemoKanban";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatSalaryRange,
  remoteTypeLabels,
} from "./format";

type Pane = "details" | "history";

const panes = [
  { pane: "details", label: "Details", Icon: FileText },
  { pane: "history", label: "CV Generations", Icon: History },
] as const;

const outcomeStyles = {
  PENDING: "border-yellow-300 bg-yellow-100 text-yellow-800",
  PASSED: "border-green-300 bg-green-100 text-green-800",
  FAILED: "border-red-300 bg-red-100 text-red-800",
  CANCELLED: "border-gray-300 bg-gray-100 text-gray-800",
} as const;

const outcomeLabels = {
  PENDING: "Pending",
  PASSED: "Passed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
} as const;

/** Read-only view of one prepared Application; the demo offers no edit or generation actions. */
export function ApplicationPreview({
  application,
  onClose,
}: {
  application: DemoApplication;
  onClose: () => void;
}) {
  const [activePane, setActivePane] = useState<Pane>("details");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-3"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-card border border-light-gray bg-white shadow-xl"
      >
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-md p-1.5 text-medium-gray hover:bg-off-white focus-visible:outline-2 focus-visible:outline-accent-dark"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <header className="shrink-0 px-5 pt-5 pr-12">
          <h2 id={titleId} className="font-display text-xl font-bold">
            {application.title}
          </h2>
          <p className="mt-0.5 text-sm text-medium-gray">
            {application.company}
          </p>
        </header>

        <div
          role="tabpanel"
          aria-label={panes.find(({ pane }) => pane === activePane)!.label}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {activePane === "details" ? (
            <DetailsPane application={application} />
          ) : (
            <HistoryPane application={application} />
          )}
        </div>

        <nav
          aria-label="Application panes"
          className="shrink-0 border-t border-light-gray px-2 py-2"
        >
          <div role="tablist" className="grid grid-cols-2 gap-1">
            {panes.map(({ pane, label, Icon }) => (
              <button
                key={pane}
                type="button"
                role="tab"
                aria-selected={activePane === pane}
                onClick={() => setActivePane(pane)}
                className={`flex flex-col items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                  activePane === pane ? "text-ink" : "text-medium-gray"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function DetailBox({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-light-gray bg-off-white p-2">
      <p className="text-xs text-medium-gray">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{children}</p>
    </div>
  );
}

function DetailsPane({ application }: { application: DemoApplication }) {
  const status = statusColumns.find(
    ({ value }) => value === application.status,
  )!;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <TagBadge name={status.label} color={status.color} />
        {application.tags.map((tag) => (
          <TagBadge key={tag.name} name={tag.name} color={tag.color} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailBox label="Salary">
          {formatSalaryRange(application, "Not specified")}
        </DetailBox>
        <DetailBox label="Location">
          {application.location ?? "Not specified"}
        </DetailBox>
        <DetailBox label="Work mode">
          {application.remoteType
            ? remoteTypeLabels[application.remoteType]
            : "Not specified"}
        </DetailBox>
        <DetailBox label="Source">
          {application.source ?? "Not specified"}
        </DetailBox>
        <DetailBox label="Applied date">
          {formatDate(application.appliedAt)}
        </DetailBox>
      </div>

      <section className="grid gap-3">
        <h3 className="font-display text-lg font-bold">Interviews</h3>
        {application.interviews.length === 0 ? (
          <p className="text-sm text-medium-gray">
            No Interviews recorded for this Application.
          </p>
        ) : (
          <ul className="grid gap-2">
            {application.interviews.map((interview) => (
              <li
                key={interview.scheduledAt}
                className="grid gap-1 rounded-md border border-light-gray p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{interview.type}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${outcomeStyles[interview.outcome]}`}
                  >
                    {outcomeLabels[interview.outcome]}
                  </span>
                </div>
                <p className="text-sm text-medium-gray">
                  {formatDateTime(interview.scheduledAt)} · {interview.location}
                </p>
                {interview.notes ? (
                  <p className="text-sm">{interview.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryPane({ application }: { application: DemoApplication }) {
  const historyHeadingId = useId();
  const cvsHeadingId = useId();

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            id={cvsHeadingId}
            className="text-sm font-semibold text-accent-darkest"
          >
            Generated CVs
          </h3>
          <span className="text-xs text-medium-gray">
            {application.generatedCvs.length} / 20
          </span>
        </div>
        {application.generatedCvs.length === 0 ? (
          <p className="text-sm text-medium-gray">
            No Generated CVs yet for this Application.
          </p>
        ) : (
          <ul aria-labelledby={cvsHeadingId} className="grid gap-2">
            {application.generatedCvs.map((generatedCv) => (
              <li
                key={generatedCv.version}
                className="rounded-md border border-light-gray bg-off-white px-3 py-2"
              >
                <p className="truncate text-sm font-medium">
                  {generatedCv.filename}
                </p>
                <p className="mt-0.5 text-xs text-medium-gray">
                  v{generatedCv.version} · {generatedCv.format} ·{" "}
                  {formatBytes(generatedCv.byteSize)} ·{" "}
                  {formatDateTime(generatedCv.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h3
          id={historyHeadingId}
          className="text-sm font-semibold text-accent-darkest"
        >
          CV Generation history
        </h3>
        {application.cvGenerations.length === 0 ? (
          <p className="text-sm text-medium-gray">
            No CV Generations yet for this Application.
          </p>
        ) : (
          <ul aria-labelledby={historyHeadingId} className="grid gap-2">
            {application.cvGenerations.map((generation) => (
              <li
                key={generation.id}
                className="grid gap-0.5 rounded-md border border-light-gray px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {generation.format}
                    {generation.generatedCvVersion
                      ? ` · v${generation.generatedCvVersion}`
                      : ""}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      generation.status === "COMPLETED"
                        ? outcomeStyles.PASSED
                        : outcomeStyles.FAILED
                    }`}
                  >
                    {generation.status === "COMPLETED" ? "Completed" : "Failed"}
                  </span>
                </div>
                <p className="text-xs text-medium-gray">
                  Requested {formatDateTime(generation.requestedAt)}
                </p>
                {generation.errorMessage ? (
                  <p className="text-xs text-red-700">
                    {generation.errorMessage}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
