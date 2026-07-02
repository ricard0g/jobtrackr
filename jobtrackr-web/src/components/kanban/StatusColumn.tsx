import { CollisionPriority } from "@dnd-kit/abstract";
import { useDroppable } from "@dnd-kit/react";
import { Plus } from "lucide-react";

import { CreatePostulationDialog } from "@/components/postulations/CreatePostulationDialog";
import { Button } from "@/components/ui/button";
import type { Application, ApplicationStatus } from "@/types/application";
import type { Company } from "@/types/company";
import { PostulationCard } from "./PostulationCard";

interface StatusColumnProps {
	status: {
		value: ApplicationStatus;
		label: string;
		color: string;
	};
	applications: Application[];
	companies: Company[];
	allApplications: Application[];
	onOpenDetails: (application: Application) => void;
}

export function StatusColumn({
	status,
	applications,
	companies,
	allApplications,
	onOpenDetails,
}: StatusColumnProps) {
	const { ref } = useDroppable({
		id: status.value,
		type: "column",
		accept: "item",
		collisionPriority: CollisionPriority.Low,
	});

	return (
		<div
			ref={ref}
			className="h-[85vh] w-72 overflow-y-hidden rounded-lg border border-light-gray bg-off-white p-4 shadow-cool-light"
		>
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center justify-start gap-x-2">
					<div
						className="h-2 w-2 rounded-full"
						style={{ backgroundColor: status.color }}
					/>
					{status.label}
				</div>
				<CreatePostulationDialog
					companies={companies}
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

			<div className="scrollbar-hide flex max-h-full flex-col gap-y-2 overflow-y-scroll pb-10">
				{applications.map((application, index) => (
					<PostulationCard
						key={application.applicationId}
						index={index}
						status={status.value}
						application={application}
						onOpenDetails={onOpenDetails}
					/>
				))}
			</div>
		</div>
	);
}
