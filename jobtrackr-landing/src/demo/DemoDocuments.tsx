import { File, Files, FileText } from "lucide-react";
import { Tabs } from "radix-ui";
import { useCallback, useState } from "react";
import { demoApplications, type DemoApplication } from "./demo-data";
import { formatDateTime } from "./format";
import { GeneratedCvPreview } from "./GeneratedCvPreview";
import { DocumentActions } from "./documents/DocumentActions";
import {
  DocumentTable,
  type DocumentTableColumn,
} from "./documents/DocumentTable";

const documents = demoApplications
  .flatMap((application) =>
    application.generatedCvs.map((cv) => ({ application, cv })),
  )
  .sort((a, b) => b.cv.createdAt.localeCompare(a.cv.createdAt));
type DocumentRow = (typeof documents)[number];
type SortKey = "name" | "type" | "size" | "created" | "version" | "company";
const compactNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const formatSize = (bytes: number) =>
  `${compactNumber.format(bytes / 1024)} kB`;
const sortValue = (row: DocumentRow, key: SortKey): string | number => {
  switch (key) {
    case "name":
      return row.cv.filename;
    case "type":
      return row.cv.format;
    case "size":
      return row.cv.byteSize;
    case "created":
      return row.cv.createdAt;
    case "version":
      return row.cv.version;
    case "company":
      return row.application.company;
  }
};

/** DocumentsRoute's prepared-data counterpart: same tabs, recent strip, table, and preview controls. */
export function DemoDocuments({
  onOpenApplication,
}: {
  onOpenApplication: (application: DemoApplication) => void;
}) {
  const [tab, setTab] = useState("generated");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>(
    { key: "created", direction: "desc" },
  );
  const [preview, setPreview] = useState<{
    row: DocumentRow;
    returnFocus: HTMLElement;
  } | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const rows = [...documents].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    const result =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "en", {
            sensitivity: "base",
          });
    return result * (sort.direction === "asc" ? 1 : -1);
  });
  const columns: DocumentTableColumn<DocumentRow, SortKey>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      className: "w-[21%]",
      render: ({ cv }) => cv.filename.replace(/\.[^.]+$/, ""),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      className: "w-[9%]",
      render: ({ cv }) => cv.format,
    },
    {
      key: "size",
      label: "Size",
      sortable: true,
      className: "w-[9%]",
      render: ({ cv }) => formatSize(cv.byteSize),
    },
    {
      key: "created",
      label: tab === "base" ? "Uploaded" : "Created",
      sortable: true,
      className: "w-[24%]",
      render: ({ cv }) => formatDateTime(cv.createdAt),
    },
    ...(tab === "generated"
      ? ([
          {
            key: "version",
            label: "Version",
            sortable: true,
            className: "w-[10%]",
            render: ({ cv }) => cv.version,
          },
          {
            key: "company",
            label: "Company",
            sortable: true,
            className: "w-[20%] md:w-[14%]",
            render: ({ application }) => application.company,
          },
        ] satisfies DocumentTableColumn<DocumentRow, SortKey>[])
      : []),
    {
      key: "actions",
      label: "Actions",
      className: "sticky right-0 w-[88px] md:w-[13%]",
      headerClassName:
        "z-10 rounded-md bg-documents-surface shadow-cool-light-table-head [padding-inline:10px] md:rounded-none md:bg-transparent md:shadow-none md:[padding-inline:24px]",
      cellClassName:
        "z-10 rounded-md bg-documents-surface [padding-inline:10px] md:static md:rounded-none md:bg-transparent md:[padding-inline:24px]",
      render: (row) => (
        <DocumentActions
          filename={row.cv.filename}
          onPreview={(returnFocus) => setPreview({ row, returnFocus })}
          onOpenApplication={() => onOpenApplication(row.application)}
        />
      ),
    },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-12 text-dark-gray sm:px-6 sm:pt-5">
      <h1 className="sr-only">Documents</h1>
      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          setSort({ key: "created", direction: "desc" });
        }}
        activationMode="manual"
        className="mx-auto w-full max-w-[1440px] rounded-[12px] bg-documents-panel p-4 shadow-cool-light-inner sm:p-6"
      >
        <div className="mb-4 flex w-full max-w-full items-center gap-2.5 rounded-[12px] border border-light-gray bg-documents-surface p-1.5 shadow-documents-surface sm:w-fit">
          <span className="hidden shrink-0 px-2.5 font-display text-base sm:inline-block">
            Your Documents
          </span>
          <span
            aria-hidden="true"
            className="hidden h-8 w-px shrink-0 bg-light-gray sm:inline-block"
          />
          <Tabs.List
            aria-label="Your Documents"
            className="flex w-full min-w-0 items-center rounded-md bg-documents-tab-track p-1 shadow-inner sm:w-auto"
          >
            {[
              { value: "generated", label: "Generated CVs", Icon: Files },
              { value: "base", label: "Base CVs", Icon: FileText },
            ].map(({ value, label, Icon }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="flex h-8 w-full min-w-0 items-center justify-center gap-2 rounded px-2.5 font-display text-base text-medium-gray outline-none transition-colors hover:text-dark-gray focus-visible:ring-2 focus-visible:ring-accent-dark data-[state=active]:bg-documents-surface data-[state=active]:text-accent-darkest data-[state=active]:shadow-site-light sm:w-auto sm:justify-start sm:px-3.5"
              >
                <Icon aria-hidden="true" size={16} className="shrink-0" />
                <span className="truncate">{label}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>
        <Tabs.Content
          value={tab}
          className="rounded-[12px] py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent-dark"
        >
          {tab === "generated" ? (
            <section
              aria-labelledby="demo-recent-files-heading"
              className="mb-5 min-h-[102px] rounded-[12px] bg-documents-panel px-4 py-2.5 shadow-recent-files"
            >
              <h2 id="demo-recent-files-heading" className="text-sm">
                Recent files
              </h2>
              <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
                {documents.map((row) => (
                  <button
                    key={row.cv.filename}
                    type="button"
                    aria-label={`Preview ${row.cv.filename} from Recent files`}
                    title={row.cv.filename}
                    onClick={(event) =>
                      setPreview({ row, returnFocus: event.currentTarget })
                    }
                    className="flex h-[52px] w-[min(220px,70vw)] shrink-0 items-center gap-2.5 rounded-lg bg-documents-surface px-2.5 text-left shadow-inset-crisp outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-accent-dark md:w-auto md:min-w-0"
                  >
                    <FileText
                      aria-hidden="true"
                      size={24}
                      className="shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {row.cv.filename}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-medium-gray">
                        {formatDateTime(row.cv.createdAt)} ·{" "}
                        {formatSize(row.cv.byteSize)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <DocumentTable
            label={tab === "generated" ? "Generated CVs" : "Base CVs"}
            columns={columns}
            rows={tab === "generated" ? rows : []}
            rowKey={({ cv }) => cv.filename}
            sortKey={sort.key}
            direction={sort.direction}
            onSort={(key) =>
              setSort({
                key,
                direction:
                  sort.key === key && sort.direction === "asc" ? "desc" : "asc",
              })
            }
            empty={
              <div className="flex flex-col items-center text-medium-gray">
                <File
                  aria-hidden="true"
                  className="mb-2.5 opacity-70"
                  size={32}
                />
                <h3 className="text-sm font-semibold text-dark-gray">
                  No Base CVs yet
                </h3>
                <p className="mt-1 max-w-md text-sm">
                  This public demo previews prepared Generated CVs.
                </p>
              </div>
            }
          />
        </Tabs.Content>
      </Tabs.Root>
      {preview ? (
        <GeneratedCvPreview
          key={preview.row.cv.filename}
          cv={preview.row.cv}
          returnFocus={preview.returnFocus}
          onClose={closePreview}
        />
      ) : null}
    </div>
  );
}
