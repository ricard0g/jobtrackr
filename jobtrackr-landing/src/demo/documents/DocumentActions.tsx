import { EllipsisVertical, Eye, Link2 } from "lucide-react";
import { Popover } from "radix-ui";
import { useRef, useState } from "react";
import { DocumentButton } from "./DocumentButton";

export function DocumentActions({
  filename,
  onPreview,
  onOpenApplication,
}: {
  filename: string;
  onPreview: (returnFocus: HTMLElement) => void;
  onOpenApplication: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openingPreview = useRef(false);
  return (
    <>
      <div className="hidden items-center justify-center gap-1.5 md:flex">
        <DocumentButton
          className="w-8 px-0"
          aria-label={`Open application for ${filename}`}
          title="Open Application"
          onClick={onOpenApplication}
        >
          <Link2 aria-hidden="true" />
        </DocumentButton>
        <DocumentButton
          className="w-8 px-0"
          aria-label={`Preview ${filename}`}
          title="Preview"
          onClick={(event) => onPreview(event.currentTarget)}
        >
          <Eye aria-hidden="true" />
        </DocumentButton>
      </div>
      <div className="flex justify-center md:hidden">
        <Popover.Root
          open={open}
          onOpenChange={(next) => {
            openingPreview.current = false;
            setOpen(next);
          }}
        >
          <Popover.Trigger asChild>
            <DocumentButton
              ref={triggerRef}
              className="h-10 w-10 bg-documents-surface p-4 shadow-inset-crisp"
              aria-label={`More actions for ${filename} on small screens`}
              aria-haspopup="menu"
            >
              <EllipsisVertical aria-hidden="true" />
            </DocumentButton>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              role="menu"
              aria-label={`Actions for ${filename}`}
              align="end"
              sideOffset={4}
              className="z-30 w-48 rounded-lg border border-light-gray bg-documents-surface p-2.5 shadow-documents-surface"
              onCloseAutoFocus={(event) => {
                if (openingPreview.current) event.preventDefault();
              }}
            >
              <DocumentButton
                role="menuitem"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  onOpenApplication();
                }}
              >
                <Link2 aria-hidden="true" />
                Open Application
              </DocumentButton>
              <DocumentButton
                role="menuitem"
                className="w-full justify-start"
                onClick={() => {
                  openingPreview.current = true;
                  setOpen(false);
                  onPreview(triggerRef.current!);
                }}
              >
                <Eye aria-hidden="true" />
                Preview
              </DocumentButton>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </>
  );
}
