import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { DocumentButton } from "./DocumentButton";

type Column<Row, SortKey extends string> = {
  label: string;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: Row) => ReactNode;
} & ({ key: SortKey; sortable: true } | { key: string; sortable?: false });

/** Static-data adaptation of jobtrackr-web's DocumentTable, including its surfaces and sizing. */
export function DocumentTable<Row, SortKey extends string>({
  label,
  columns,
  rows,
  rowKey,
  sortKey,
  direction,
  onSort,
  empty,
}: {
  label: string;
  columns: Column<Row, SortKey>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  sortKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  empty: ReactNode;
}) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[44px] bottom-0 rounded-[12px] bg-documents-surface py-0.5 shadow-documents-surface"
      />
      <div className="overflow-x-auto">
        <div className="relative min-w-[1100px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-0 h-[44px] rounded-t-[12px] bg-documents-surface shadow-cool-light-table-head"
          />
          <table
            aria-label={label}
            className="relative w-full table-fixed border-collapse text-center text-base text-dark-gray"
          >
            <thead>
              <tr className="h-[44px]">
                {columns.map((column) => {
                  const active = column.sortable && column.key === sortKey;
                  const Icon = active
                    ? direction === "asc"
                      ? ChevronUp
                      : ChevronDown
                    : ChevronsUpDown;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        column.sortable
                          ? active
                            ? direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                      className={`px-6 font-normal text-medium-gray ${column.className ?? ""} ${column.headerClassName ?? ""}`}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => onSort(column.key)}
                          className="mx-auto flex items-center gap-1.5 rounded-sm outline-none hover:text-black focus-visible:ring-2 focus-visible:ring-accent-dark"
                        >
                          {column.label}
                          <Icon aria-hidden="true" size={14} />
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="h-[480px]">
                  <td colSpan={columns.length} className="px-8 text-center">
                    {empty}
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className="relative h-12 border-b border-black/20 last:border-b-0"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`truncate px-6 ${column.className ?? ""} ${column.cellClassName ?? ""}`}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {Array.from(
                    { length: Math.max(0, 10 - rows.length) },
                    (_, index) => (
                      <tr
                        key={`placeholder-${index}`}
                        aria-hidden="true"
                        className="h-12 border-b border-black/10 last:border-b-0"
                      >
                        <td colSpan={columns.length} />
                      </tr>
                    ),
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="relative flex items-center justify-between gap-4 border-t border-black/20 px-6 py-2.5 text-sm">
        <p aria-live="polite" className="text-medium-gray">
          {rows.length ? "1 of 1" : "0 of 0"}
        </p>
        <div className="flex items-center gap-2.5">
          <DocumentButton aria-label="Previous page" disabled>
            Previous
          </DocumentButton>
          <DocumentButton aria-label="Next page" disabled>
            Next
          </DocumentButton>
        </div>
      </div>
    </div>
  );
}

export type { Column as DocumentTableColumn };
