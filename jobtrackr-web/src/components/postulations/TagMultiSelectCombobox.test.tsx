import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TagMultiSelectCombobox } from "./TagMultiSelectCombobox";
import type { Tag, TagWriteRequest } from "@/types/tag";

const tags: Tag[] = [
	{
		tagId: 1,
		tagCategory: "TECH_STACK",
		tagName: "React",
		tagColor: "#61dafb",
		global: false,
	},
	{
		tagId: 2,
		tagCategory: "MODALITY",
		tagName: "Remote",
		tagColor: "#16a34a",
		global: false,
	},
	{
		tagId: 3,
		tagCategory: "COMPANY_TYPE",
		tagName: "Startup",
		tagColor: null,
		global: false,
	},
];

beforeAll(() => {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}

	Object.defineProperty(globalThis, "ResizeObserver", {
		value: ResizeObserverMock,
		configurable: true,
	});
	Object.defineProperties(HTMLElement.prototype, {
		hasPointerCapture: {
			value: () => false,
			configurable: true,
		},
		setPointerCapture: {
			value: () => undefined,
			configurable: true,
		},
		releasePointerCapture: {
			value: () => undefined,
			configurable: true,
		},
		scrollIntoView: {
			value: () => undefined,
			configurable: true,
		},
	});
});

type HarnessProps = {
	availableTags?: Tag[];
	initialSelected?: number[];
	isSubmitting?: boolean;
	error?: string;
	onApply?: (selectedTagIds: ReadonlySet<number>) => void;
	onCreateTag?: (request: TagWriteRequest) => void;
};

function Harness({
	availableTags = tags,
	initialSelected = [1],
	isSubmitting = false,
	error,
	onApply = () => undefined,
	onCreateTag = () => undefined,
}: HarnessProps) {
	const [open, setOpen] = useState(false);
	const [selectedTagIds, setSelectedTagIds] = useState(
		() => new Set(initialSelected),
	);
	const committedTagIds = new Set(initialSelected);

	const resetAndClose = () => {
		setSelectedTagIds(new Set(committedTagIds));
		setOpen(false);
	};

	return (
		<TagMultiSelectCombobox
			tags={availableTags}
			selectedTagIds={selectedTagIds}
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) {
					setSelectedTagIds(new Set(committedTagIds));
					setOpen(true);
				} else {
					resetAndClose();
				}
			}}
			onSelectedTagIdsChange={setSelectedTagIds}
			onApply={() => onApply(selectedTagIds)}
			onCancel={resetAndClose}
			onCreateTag={onCreateTag}
			isSubmitting={isSubmitting}
			error={error}
		/>
	);
}

const openCombobox = () => fireEvent.click(screen.getByRole("combobox"));
const openCreateForm = () => fireEvent.click(screen.getByText("Add Tag"));

describe("TagMultiSelectCombobox", () => {
	it("shows all tags and marks existing selections", () => {
		render(<Harness initialSelected={[1, 3]} />);

		openCombobox();

		expect(screen.getByText("React")).toBeTruthy();
		expect(screen.getByText("Remote")).toBeTruthy();
		expect(screen.getByText("Startup")).toBeTruthy();
		expect(screen.getByRole("checkbox", { name: "React" }).getAttribute("data-state")).toBe("checked");
		expect(screen.getByRole("checkbox", { name: "Remote" }).getAttribute("data-state")).toBe("unchecked");
	});

	it("filters tags case-insensitively", () => {
		render(<Harness />);
		openCombobox();

		fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
			target: { value: "REMo" },
		});

		expect(screen.getByText("Remote")).toBeTruthy();
		expect(screen.queryByText("React")).toBeNull();
	});

	it("creates a tag with its category, name, and hex color", () => {
		const onCreateTag = vi.fn();
		render(<Harness onCreateTag={onCreateTag} />);
		openCombobox();
		openCreateForm();

		fireEvent.pointerDown(screen.getByRole("combobox", { name: "Tag category" }), {
			button: 0,
			ctrlKey: false,
			pointerType: "mouse",
		});
		fireEvent.click(screen.getByRole("option", { name: "Tech stack" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Tag name" }), {
			target: { value: "TypeScript" },
		});
		fireEvent.change(screen.getByRole("textbox", { name: "Tag hex color" }), {
			target: { value: "#3178C6" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create tag" }));

		expect(onCreateTag).toHaveBeenCalledWith({
			tagCategory: "TECH_STACK",
			tagName: "TypeScript",
			tagColor: "#3178C6",
		});
	});

	it("keeps the color picker and hex input in sync", () => {
		render(<Harness />);
		openCombobox();
		openCreateForm();

		fireEvent.change(screen.getByLabelText("Choose tag color"), {
			target: { value: "#16a34a" },
		});

		expect(
			(screen.getByRole("textbox", {
				name: "Tag hex color",
			}) as HTMLInputElement).value,
		).toBe("#16A34A");
	});

	it("validates the tag name and hex color before creating", () => {
		const onCreateTag = vi.fn();
		render(<Harness onCreateTag={onCreateTag} />);
		openCombobox();
		openCreateForm();

		fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
		expect(screen.getByRole("alert").textContent).toContain("Enter a tag name");

		fireEvent.change(screen.getByRole("textbox", { name: "Tag name" }), {
			target: { value: "TypeScript" },
		});
		fireEvent.change(screen.getByRole("textbox", { name: "Tag hex color" }), {
			target: { value: "blue" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create tag" }));

		expect(screen.getByRole("alert").textContent).toContain("#RRGGBB");
		expect(onCreateTag).not.toHaveBeenCalled();
	});

	it("keeps the creation fields hidden until Add Tag is selected", () => {
		render(<Harness />);
		openCombobox();

		expect(screen.queryByRole("textbox", { name: "Tag name" })).toBeNull();
		openCreateForm();
		expect(screen.getByRole("textbox", { name: "Tag name" })).toBeTruthy();
		openCreateForm();
		expect(screen.queryByRole("textbox", { name: "Tag name" })).toBeNull();
	});

	it("stages multiple selections and applies the complete set", () => {
		const onApply = vi.fn();
		render(<Harness onApply={onApply} />);
		openCombobox();

		fireEvent.click(screen.getByText("Remote"));
		fireEvent.click(screen.getByText("Startup"));

		expect(screen.getByText("Remote")).toBeTruthy();
		expect(screen.getByText("Startup")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(Array.from(onApply.mock.calls[0][0])).toEqual([1, 2, 3]);
	});

	it("allows clearing all tags and disables Apply when unchanged", () => {
		const onApply = vi.fn();
		render(<Harness onApply={onApply} />);
		openCombobox();

		expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(screen.getByText("React"));
		expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(Array.from(onApply.mock.calls[0][0])).toEqual([]);
	});

	it("discards staged selections when cancelled", () => {
		render(<Harness />);
		openCombobox();
		fireEvent.click(screen.getByText("Remote"));
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(screen.queryByPlaceholderText("Search tags...")).toBeNull();
		expect(screen.getByRole("combobox").textContent).toContain("Tags (1)");
	});

	it("discards staged selections when dismissed with Escape", () => {
		render(<Harness />);
		openCombobox();
		fireEvent.click(screen.getByText("Remote"));
		fireEvent.keyDown(document, { key: "Escape" });

		expect(screen.queryByPlaceholderText("Search tags...")).toBeNull();
		expect(screen.getByRole("combobox").textContent).toContain("Tags (1)");
	});

	it("discards staged selections when dismissed from outside", async () => {
		render(<Harness />);
		openCombobox();
		fireEvent.click(screen.getByText("Remote"));
		await new Promise((resolve) => window.setTimeout(resolve, 0));
		fireEvent.pointerDown(document.body, {
			button: 0,
			pointerId: 1,
			pointerType: "mouse",
		});

		await waitFor(() => {
			expect(screen.queryByPlaceholderText("Search tags...")).toBeNull();
		});
		expect(screen.getByRole("combobox").textContent).toContain("Tags (1)");
	});

	it("shows empty states", () => {
		const { unmount } = render(<Harness availableTags={[]} initialSelected={[]} />);
		openCombobox();
		expect(screen.getByText("No tags available.")).toBeTruthy();
		unmount();

		render(<Harness />);
		openCombobox();
		fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
			target: { value: "missing" },
		});
		expect(screen.getByText("No tags found.")).toBeTruthy();
	});

	it("displays submission state and errors", () => {
		const { rerender } = render(<Harness error="Could not update tags." />);
		openCombobox();
		expect(screen.getByText("Could not update tags.")).toBeTruthy();

		rerender(<Harness isSubmitting error="Could not update tags." />);
		expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
	});
});
