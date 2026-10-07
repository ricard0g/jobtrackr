import { CollisionPriority } from "@dnd-kit/abstract";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Building2 } from "lucide-react";
import { useRef, useState, type RefObject } from "react";

import {
  demoApplications,
  initialItemIdsByStatus,
  statusColumns,
  type ApplicationStatus,
  type DemoApplication,
  type ItemIdsByStatus,
} from "./demo-data";
import { formatDate, formatSalaryRange } from "./format";

const applicationsById = new Map(
  demoApplications.map((application) => [application.id, application]),
);

interface DemoKanbanProps {
  onOpenApplication: (application: DemoApplication) => void;
}

/** Card moves live only in this component's state; a reload restores the prepared board. */
export function DemoKanban({ onOpenApplication }: DemoKanbanProps) {
  const [itemIdsByStatus, setItemIdsByStatus] = useState(
    initialItemIdsByStatus,
  );
  const snapshotRef = useRef<ItemIdsByStatus | null>(null);
  // A pointer release that ends a drag must not also open the card.
  const draggedRef = useRef(false);

  return (
    <DragDropProvider
      onDragStart={() => {
        snapshotRef.current = itemIdsByStatus;
        draggedRef.current = true;
      }}
      onDragOver={(event) => {
        setItemIdsByStatus((current) => move(current, event));
      }}
      onDragEnd={(event) => {
        if (event.canceled && snapshotRef.current) {
          setItemIdsByStatus(snapshotRef.current);
        }
        snapshotRef.current = null;
        window.setTimeout(() => {
          draggedRef.current = false;
        });
      }}
    >
      <div className="flex min-h-0 flex-1 gap-x-3 overflow-x-auto px-4 pt-2 pb-4">
        {statusColumns.map((status) => (
          <StatusColumn
            key={status.value}
            status={status}
            applicationIds={itemIdsByStatus[status.value]}
            draggedRef={draggedRef}
            onOpenApplication={onOpenApplication}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

function StatusColumn({
  status,
  applicationIds,
  draggedRef,
  onOpenApplication,
}: {
  status: (typeof statusColumns)[number];
  applicationIds: number[];
  draggedRef: RefObject<boolean>;
  onOpenApplication: (application: DemoApplication) => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: status.value,
    type: "column",
    accept: "item",
    collisionPriority: CollisionPriority.Low,
  });

  return (
    <section
      ref={ref}
      aria-label={`${status.label} column`}
      className={`flex min-h-0 w-64 shrink-0 flex-col overflow-hidden rounded-lg border bg-off-white p-3 [box-shadow:var(--shadow-cool-light)] transition-[background-color,border-color] duration-150 ${
        isDropTarget
          ? "border-accent-dark bg-accent-lightest"
          : "border-light-gray"
      }`}
    >
      <h2 className="mb-2 flex shrink-0 items-center gap-x-2 text-sm font-medium">
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: status.color }}
        />
        {status.label}
        <span className="text-xs text-silver">{applicationIds.length}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-y-2 overflow-y-auto pt-1 pb-6 [scrollbar-width:none]">
        {applicationIds.map((applicationId, index) => (
          <ApplicationCard
            key={applicationId}
            application={applicationsById.get(applicationId)!}
            index={index}
            status={status.value}
            draggedRef={draggedRef}
            onOpen={onOpenApplication}
          />
        ))}
      </div>
    </section>
  );
}

function ApplicationCard({
  application,
  index,
  status,
  draggedRef,
  onOpen,
}: {
  application: DemoApplication;
  index: number;
  status: ApplicationStatus;
  draggedRef: RefObject<boolean>;
  onOpen: (application: DemoApplication) => void;
}) {
  const { ref, isDragSource } = useSortable({
    id: application.id,
    index,
    group: status,
    type: "item",
    accept: "item",
    transition: { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${application.company}, ${application.title}`}
      onClick={() => {
        if (!draggedRef.current) onOpen(application);
      }}
      // Children ignore pointers so dnd-kit sees the card, not content inside an interactive element.
      className={`flex w-full shrink-0 cursor-pointer [&_*]:pointer-events-none touch-manipulation flex-col items-start gap-y-2.5 rounded-lg border border-off-white bg-white p-3 text-left shadow-md select-none outline-none focus-visible:ring-3 focus-visible:ring-accent-medium ${
        isDragSource ? "opacity-45 shadow-none" : ""
      }`}
    >
      <span className="flex w-full min-w-0 items-center gap-x-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-light-gray text-medium-gray">
          <Building2 size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display font-bold">
            {application.company}
          </span>
          <span className="block truncate text-sm text-medium-gray">
            {application.title}
          </span>
        </span>
      </span>
      {application.tags.length > 0 ? (
        <span className="flex w-full gap-x-1 overflow-hidden">
          {application.tags.map((tag) => (
            <TagBadge key={tag.name} name={tag.name} color={tag.color} />
          ))}
        </span>
      ) : null}
      <span aria-hidden="true" className="h-px w-full bg-light-gray" />
      <span className="flex w-full items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-semibold">
          {formatSalaryRange(application, "Salary not specified")}
        </span>
        <span className="shrink-0 text-medium-gray">
          {formatDate(application.appliedAt)}
        </span>
      </span>
    </button>
  );
}

export function TagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-full border px-2 text-xs"
      style={{ color, borderColor: color, backgroundColor: `${color}22` }}
    >
      {name}
    </span>
  );
}
