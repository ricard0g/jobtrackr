import { LayoutDashboard } from "lucide-react";
import { useCallback, useState } from "react";

import { ApplicationPreview } from "./ApplicationPreview";
import type { DemoApplication } from "./demo-data";
import { DemoKanban } from "./DemoKanban";

export function PublicDemo() {
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
          <button
            type="button"
            aria-current="page"
            className="flex h-8 items-center gap-2 rounded-md bg-accent-light px-3 font-semibold text-accent-darkest"
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            Kanban
          </button>
        </nav>
        <p className="text-xs text-medium-gray">
          Preview with fictional data · changes reset on reload
        </p>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <DemoKanban onOpenApplication={setOpenApplication} />
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
