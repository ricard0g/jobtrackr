import { useSortable } from "@dnd-kit/react/sortable";
import { Building2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { Application } from "@/types/application";

interface PostulationCardProps {
	index: number;
	status: string;
	application: Application;
	onOpenDetails: (application: Application) => void;
}

const formatLocalDate = (date: string | null): string => {
	if (!date) return "Not specified";
	const parsedDate = new Date(date);
	if (Number.isNaN(parsedDate.getTime())) return "Not specified";

	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
	}).format(parsedDate);
};

const formatSalaryValue = (value: number | null | undefined) => {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return null;
	}

	return `${Math.round(value / 1000)}k`;
};

const formatSalaryRange = (application: Application): string => {
	const currency = application.applicationCurrency ?? "EUR";
	const min = formatSalaryValue(application.applicationSalaryMin);
	const max = formatSalaryValue(application.applicationSalaryMax);

	if (min && max) return `${currency} ${min} - ${max}`;
	if (min) return `From ${currency} ${min}`;
	if (max) return `Up to ${currency} ${max}`;

	return "Salary not specified";
};

export function PostulationCard({
	index,
	status,
	application,
	onOpenDetails,
}: PostulationCardProps) {
	const { ref, isDragging } = useSortable({
		id: application.applicationId,
		index,
		group: status,
		type: "item",
		accept: "item",
		plugins: [],
	});
	const wasDraggingRef = useRef(false);

	useEffect(() => {
		if (isDragging) {
			wasDraggingRef.current = true;
		}
	}, [isDragging]);

	const openDetails = () => {
		if (wasDraggingRef.current) {
			wasDraggingRef.current = false;
			return;
		}

		onOpenDetails(application);
	};

	return (
		<div
			ref={ref}
			data-dragging={isDragging}
			role="button"
			tabIndex={0}
			onClick={openDetails}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpenDetails(application);
				}
			}}
			className="flex cursor-grab flex-col items-start justify-start gap-y-3 rounded-lg border border-off-white bg-white p-4 shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
		>
			<div className="flex min-w-0 items-center justify-start gap-x-3">
				{application.company.companyLogo ? (
					<img
						className="h-10 w-10 rounded-md object-cover"
						src={application.company.companyLogo}
						alt={`${application.company.companyName} logo`}
					/>
				) : (
					<div className="flex h-10 w-10 items-center justify-center rounded-md bg-light-gray text-medium-gray">
						<Building2 size={18} />
					</div>
				)}
				<div className="min-w-0">
					<p className="truncate font-display font-bold">
						{application.company.companyName}
					</p>
					<p className="truncate text-sm text-medium-gray">
						{application.applicationTitle}
					</p>
				</div>
			</div>
			<div className="scrollbar-hide flex w-full gap-x-1 overflow-x-scroll">
				{application.tags.slice(0, 4).map((tag) => {
					const tagColor = tag.tagColor ?? "#666666";

					return (
						<span
							key={tag.tagId}
							title={tag.tagName}
							className="inline-flex h-6 w-20 items-center justify-center truncate rounded-full px-2 text-xs"
							style={{
								color: tagColor,
								border: `1px solid ${tagColor}`,
								backgroundColor: `${tagColor}22`,
							}}
						>
							{tag.tagName}
						</span>
					);
				})}
			</div>
			<div className="h-px w-full bg-light-gray" />
			<div className="flex w-full items-center justify-between gap-2">
				<p className="min-w-0 truncate text-sm font-semibold">
					{formatSalaryRange(application)}
				</p>
				<p className="shrink-0 text-sm text-medium-gray">
					{formatLocalDate(application.applicationAppliedAt)}
				</p>
			</div>
		</div>
	);
}
