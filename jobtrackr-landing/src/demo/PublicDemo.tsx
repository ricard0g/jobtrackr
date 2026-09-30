import { FileText, LayoutDashboard } from "lucide-react";
import { useCallback, useState } from "react";

import { ApplicationPreview } from "./ApplicationPreview";
import type { DemoApplication } from "./demo-data";
import { DemoKanban } from "./DemoKanban";
import { DemoDocuments } from "./DemoDocuments";

const workspaces = [
  { value: "kanban", label: "Kanban", Icon: LayoutDashboard },
  { value: "documents", label: "Documents", Icon: FileText },
] as const;

export function PublicDemo() {
  const [workspace, setWorkspace] = useState<"kanban" | "documents">("kanban");
  const [openApplication, setOpenApplication] =
    useState<DemoApplication | null>(null);
  const closeApplication = useCallback(() => setOpenApplication(null), []);

  return (
    <div
      data-testid="public-demo"
      className="flex h-dvh flex-col bg-page text-ink"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-2">
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-1 rounded-xl border border-light-gray bg-off-white p-1.5 [box-shadow:var(--shadow-cool-light)]"
        >
          {workspaces.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-current={workspace === value ? "page" : undefined}
              onClick={() => setWorkspace(value)}
              className={`flex h-8 items-center gap-2 rounded-md px-3 font-semibold ${workspace === value ? "bg-accent-light text-accent-darkest" : "text-medium-gray hover:bg-white"}`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <p className="text-xs text-medium-gray">
          Preview with fictional data · changes reset on reload
        </p>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <div
          className={`min-h-0 flex-1 flex-col ${workspace === "kanban" ? "flex" : "hidden"}`}
        >
          <DemoKanban onOpenApplication={setOpenApplication} />
        </div>
        {workspace === "documents" ? <DemoDocuments /> : null}
      </main>
      {openApplication ? (
        <ApplicationPreview
          application={openApplication}
          onClose={closeApplication}
        />
      ) : null}
    </div>
  );
}
