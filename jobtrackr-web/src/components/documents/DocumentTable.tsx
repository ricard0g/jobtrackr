import { ChevronDown, ChevronUp, ChevronsUpDown, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { GENERATED_CV_PAGE_SIZE, type SortDirection } from "@/routes/documents-data";

type StaticDocumentTableColumn<Row> = {
	key: string;
	label: string;
	sortable?: false;
	className?: string;
	headerClassName?: string;
	cellClassName?: string;
	render: (row: Row) => ReactNode;
};

type SortableDocumentTableColumn<Row, SortKey extends string> = Omit<
	StaticDocumentTableColumn<Row>,
	"key" | "sortable"
> & {
	key: SortKey;
	sortable: true;
};

export type DocumentTableColumn<Row, SortKey extends string = string> =
	| StaticDocumentTableColumn<Row>
	| SortableDocumentTableColumn<Row, SortKey>;

type DocumentTableProps<Row, SortKey extends string> = {
	label: string;
	columns: DocumentTableColumn<Row, SortKey>[];
	rows: Row[];
	rowKey: (row: Row) => string | number;
	sortKey: SortKey;
	direction: SortDirection;
	onSort: (sortKey: SortKey) => void;
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	empty: ReactNode;
	error?: string | null;
	onRetry?: () => void;
	retrying?: boolean;
	pending?: boolean;
};

const sortIcon = (active: boolean, direction: SortDirection) => {
	if (!active) return <ChevronsUpDown aria-hidden="true" size={14} />;
	return direction === "asc" ? (
		<ChevronUp aria-hidden="true" size={14} />
	) : (
		<ChevronDown aria-hidden="true" size={14} />
	);
};

export function DocumentTableSkeleton({
	label,
	rowCount = GENERATED_CV_PAGE_SIZE,
}: {
	label: string;
	rowCount?: number;
}) {
	return (
		<div className="relative isolate" data-slot="document-table-skeleton">
			<div
				aria-hidden="true"
				data-slot="document-table-body-surface"
				className="pointer-events-none absolute inset-x-0 top-[44px] bottom-0 rounded-[12px] bg-documents-surface py-0.5 shadow-cool-light"
			/>
			<div className="overflow-x-auto" data-slot="document-table-scroll">
				<div className="relative min-w-[1360px]">
					<div
						aria-hidden="true"
						data-slot="document-table-head-surface"
						className="pointer-events-none absolute inset-x-3 top-0 h-[44px] rounded-t-[12px] bg-documents-surface shadow-cool-light-table-head"
					/>
					<table
						aria-label={label}
						aria-busy="true"
						className="relative w-full table-fixed border-collapse text-center text-base text-dark-gray"
					>
						<thead>
							<tr className="h-[44px]">
								<th scope="col" className="px-6 font-normal text-medium-gray">
									Name
								</th>
								<th scope="col" className="px-6 font-normal text-medium-gray">
									Type
								</th>
								<th scope="col" className="px-6 font-normal text-medium-gray">
									Size
								</th>
								<th scope="col" className="px-6 font-normal text-medium-gray">
									Date
								</th>
								<th scope="col" className="px-6 font-normal text-medium-gray">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{Array.from({ length: rowCount }, (_, index) => (
								<tr
									key={index}
									data-testid="document-table-row-skeleton"
									aria-hidden="true"
									className="h-12 border-b border-black/10 last:border-b-0"
								>
									<td colSpan={5} className="px-6">
										<div className="mx-auto h-3 w-3/4 max-w-md animate-pulse rounded bg-documents-panel" />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			<div className="relative flex items-center justify-between gap-4 border-t border-black/20 px-6 py-2.5 text-sm">
				<p className="text-medium-gray">Loading…</p>
			</div>
		</div>
	);
}

export function DocumentTable<Row, SortKey extends string>({
	label,
	columns,
	rows,
	rowKey,
	sortKey,
	direction,
	onSort,
	page,
	pageSize,
	total,
	onPageChange,
	empty,
	error,
	onRetry,
	retrying = false,
	pending = false,
}: DocumentTableProps<Row, SortKey>) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(Math.max(1, page), total === 0 ? 1 : totalPages);
	const showEmptyLibrary = !error && total === 0;
	const placeholderCount = error || showEmptyLibrary ? 0 : Math.max(0, pageSize - rows.length);

	return (
		<div className="relative isolate">
			<div
				aria-hidden="true"
				data-slot="document-table-body-surface"
				className="pointer-events-none absolute inset-x-0 top-[44px] bottom-0 rounded-[12px] bg-documents-surface py-0.5 shadow-cool-light"
			/>
			<div className="overflow-x-auto" data-slot="document-table-scroll">
				<div className="relative min-w-[1360px]">
					<div
						aria-hidden="true"
						data-slot="document-table-head-surface"
						className="pointer-events-none absolute inset-x-3 top-0 h-[44px] rounded-t-[12px] bg-documents-surface shadow-cool-light-table-head"
					/>
					<table
						aria-label={label}
						aria-busy={pending}
						className="relative w-full table-fixed border-collapse text-center text-base text-dark-gray"
					>
						<thead>
							<tr className="h-[44px]">
								{columns.map((column) => {
									const active = column.sortable && column.key === sortKey;
									const ariaSort = column.sortable
										? active
											? direction === "asc"
												? "ascending"
												: "descending"
											: "none"
										: undefined;
									return (
										<th
											key={column.key}
											scope="col"
											aria-sort={ariaSort}
											className={`px-6 font-normal text-medium-gray ${column.className ?? ""} ${column.headerClassName ?? ""}`}
										>
											{column.sortable ? (
												<button
													type="button"
													disabled={pending}
													onClick={() => onSort(column.key)}
													className="flex items-center mx-auto gap-1.5 rounded-sm outline-none hover:text-black focus-visible:ring-2 focus-visible:ring-dark-accent disabled:cursor-wait"
												>
													{column.label}
													{sortIcon(Boolean(active), direction)}
												</button>
											) : (
												column.label
											)}
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody
							className={`transition-opacity ${pending ? "opacity-50" : "opacity-100"}`}
						>
							{error ? (
								<tr className="h-[480px]">
									<td colSpan={columns.length} className="px-8 text-center">
										<p role="alert" className="text-medium-gray">
											{error}
										</p>
										{onRetry ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="mt-3"
												disabled={retrying}
												onClick={onRetry}
											>
												{retrying ? <LoaderCircle className="animate-spin" /> : null}
												Retry
											</Button>
										) : null}
									</td>
								</tr>
							) : showEmptyLibrary ? (
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
									{Array.from({ length: placeholderCount }, (_, index) => (
										<tr
											key={`placeholder-${index}`}
											aria-hidden="true"
											data-testid="document-table-row-placeholder"
											className="h-12 border-b border-black/10 last:border-b-0"
										>
											<td colSpan={columns.length} />
										</tr>
									))}
								</>
							)}
						</tbody>
					</table>
				</div>
			</div>
			<div className="relative flex items-center justify-between gap-4 border-t border-black/20 px-6 py-2.5 text-sm">
				<p aria-live="polite" className="text-medium-gray">
					{total === 0 ? "0 of 0" : `${safePage} of ${totalPages}`}
				</p>
				<div className="flex items-center gap-2.5">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label="Previous page"
						disabled={pending || safePage <= 1}
						onClick={() => onPageChange(safePage - 1)}
					>
						Previous
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label="Next page"
						disabled={pending || safePage >= totalPages}
						onClick={() => onPageChange(safePage + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
