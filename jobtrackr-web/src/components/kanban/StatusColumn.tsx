import { CollisionPriority } from "@dnd-kit/abstract";
import { useDroppable } from "@dnd-kit/react";
import { Plus } from "lucide-react";
import { memo } from "react";

import { CreatePostulationDialog } from "@/components/postulations/CreatePostulationDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types/application";
import { PostulationCard } from "./PostulationCard";

interface StatusColumnProps {
	status: {
		value: ApplicationStatus;
		label: string;
		color: string;
	};
	applications: Application[];
	allApplications: Application[];
}

export const StatusColumn = memo(function StatusColumn({
	status,
	applications,
	allApplications,
}: StatusColumnProps) {
	const { ref, isDropTarget } = useDroppable({
		id: status.value,
		type: "column",
		accept: "item",
		collisionPriority: CollisionPriority.Low,
	});

	return (
		<div
			ref={ref}
			data-drop-target={isDropTarget}
			className={cn(
				"flex h-[85dvh] min-w-80 flex-col overflow-hidden rounded-lg border border-light-gray bg-off-white p-4 shadow-cool-light transition-[background-color,border-color,box-shadow] duration-150",
				isDropTarget &&
					"border-primary/50 bg-primary/5 shadow-lg ring-2 ring-primary/15",
			)}
		>
			<div className="mb-2 flex shrink-0 items-center justify-between">
				<div className="flex items-center justify-start gap-x-2">
					<div
						className="h-2 w-2 rounded-full"
						style={{ backgroundColor: status.color }}
					/>
					{status.label}
				</div>
				<CreatePostulationDialog
					applications={allApplications}
					defaultStatus={status.value}
					trigger={
						<Button
							type="button"
							variant="secondary"
							className="rounded-lg hover:bg-light-gray"
							aria-label={`Create application in ${status.label}`}
						>
							<Plus />
						</Button>
					}
				/>
			</div>

			<div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-y-2 overflow-y-auto pb-10 pt-1">
				{applications.map((application, index) => (
					<PostulationCard
						key={application.applicationId}
						index={index}
						status={status.value}
						application={application}
					/>
				))}
			</div>
		</div>
	);
});
