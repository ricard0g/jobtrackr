import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

/** The app's ghost Button styling, limited to the demo's inspection controls. */
export function DocumentButton({
  className = "",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={twMerge(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-transparent px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors hover:bg-light-gray focus-visible:ring-2 focus-visible:ring-accent-dark disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}
