import { useSortable } from "@dnd-kit/react/sortable";
import { Building2 } from "lucide-react";
import {
	memo,
	type DragEvent,
	type MouseEvent,
	type PointerEvent,
	useRef,
} from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";
import type { Application } from "@/types/application";

interface PostulationCardProps {
	index: number;
	status: string;
	application: Application;
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

const dragClickThreshold = 4;

export const PostulationCard = memo(function PostulationCard({
	index,
	status,
	application,
}: PostulationCardProps) {
	const { ref, isDragging, isDragSource, isDropTarget, isDropping } =
		useSortable({
			id: application.applicationId,
			index,
			group: status,
			type: "item",
			accept: "item",
			transition: {
				duration: 180,
				easing: "cubic-bezier(0.2, 0, 0, 1)",
			},
		});
	const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
	const suppressClickRef = useRef(false);

	const handleCardClick = (event: MouseEvent<HTMLAnchorElement>) => {
		if (suppressClickRef.current) {
			event.preventDefault();
			suppressClickRef.current = false;
			return;
		}
	};

	const handlePointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
		pointerStartRef.current = { x: event.clientX, y: event.clientY };
		suppressClickRef.current = false;
	};

	const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
		const pointerStart = pointerStartRef.current;
		if (!pointerStart) return;

		const deltaX = Math.abs(event.clientX - pointerStart.x);
		const deltaY = Math.abs(event.clientY - pointerStart.y);

		if (deltaX > dragClickThreshold || deltaY > dragClickThreshold) {
			suppressClickRef.current = true;
		}
	};

	const resetDragClickState = () => {
		pointerStartRef.current = null;
		window.setTimeout(() => {
			suppressClickRef.current = false;
		}, 100);
	};

	const preventNativeDrag = (event: DragEvent<HTMLAnchorElement>) => {
		event.preventDefault();
	};

	return (
		<Link
			ref={ref}
			to={`/applications/${application.applicationId}`}
			draggable={false}
			data-dragging={isDragging}
			data-drag-source={isDragSource}
			data-drop-target={isDropTarget}
			data-dropping={isDropping}
			onClick={handleCardClick}
			onDragStart={preventNativeDrag}
			onPointerCancel={resetDragClickState}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={resetDragClickState}
			className={cn(
				"flex h-fit min-h-fit w-full max-w-full shrink-0 cursor-pointer flex-col items-start justify-start gap-y-3 overflow-hidden rounded-lg border border-off-white bg-white p-4 shadow-md outline-none transition-[border-color,box-shadow,opacity,transform] duration-150 focus-visible:ring-3 focus-visible:ring-ring/30",
				"active:cursor-grabbing data-[dragging=true]:cursor-grabbing data-[drag-source=true]:cursor-grabbing",
				isDropTarget &&
					"border-primary/70 shadow-lg ring-2 ring-primary/25",
				isDragSource && "opacity-45 shadow-none",
				isDropping && "scale-[0.98]",
			)}
		>
			<div className="flex min-w-0 items-center justify-start gap-x-3 pointer-events-none">
				{application.company.companyLogo ? (
					<img
						className="h-10 w-10 rounded-md object-cover"
						src={application.company.companyLogo}
						alt={`${application.company.companyName} logo`}
						draggable={false}
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
			<div className="scrollbar-hide flex w-full gap-x-1 overflow-x-scroll pointer-events-none">
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
							{tag.tagName.length > 7
								? tag.tagName.slice(0, 7).trim()
								: tag.tagName}
						</span>
					);
				})}
			</div>
			<div className="h-px w-full bg-light-gray pointer-events-none" />
			<div className="flex w-full items-center justify-between gap-2 pointer-events-none">
				<p className="min-w-0 truncate text-sm font-semibold">
					{formatSalaryRange(application)}
				</p>
				<p className="shrink-0 text-sm text-medium-gray">
					{formatLocalDate(application.applicationAppliedAt)}
				</p>
			</div>
		</Link>
	);
});
