import { Loader2, Tags as TagsIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Tag } from "@/types/tag";

export type TagMultiSelectComboboxProps = {
	tags: Tag[];
	selectedTagIds: ReadonlySet<number>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectedTagIdsChange: (ids: Set<number>) => void;
	onApply: () => void;
	onCancel: () => void;
	disabled?: boolean;
	isSubmitting?: boolean;
	error?: string;
	trigger?: ReactNode;
	collisionBoundary?: Element | null;
};

const setsAreEqual = (
	left: ReadonlySet<number>,
	right: ReadonlySet<number>,
) =>
	left.size === right.size && Array.from(left).every((value) => right.has(value));

export function TagMultiSelectCombobox({
	tags,
	selectedTagIds,
	open,
	onOpenChange,
	onSelectedTagIdsChange,
	onApply,
	onCancel,
	disabled = false,
	isSubmitting = false,
	error,
	trigger,
	collisionBoundary,
}: TagMultiSelectComboboxProps) {
	const [search, setSearch] = useState("");
	const [initialSelectedTagIds, setInitialSelectedTagIds] = useState<
		ReadonlySet<number>
	>(new Set());
	const filteredTags = useMemo(() => {
		const normalizedSearch = search.trim().toLocaleLowerCase();
		if (!normalizedSearch) return tags;

		return tags.filter((tag) =>
			tag.tagName.toLocaleLowerCase().includes(normalizedSearch),
		);
	}, [search, tags]);
	const hasChanges = !setsAreEqual(
		selectedTagIds,
		initialSelectedTagIds,
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			setInitialSelectedTagIds(new Set(selectedTagIds));
			setSearch("");
		} else {
			setSearch("");
		}

		onOpenChange(nextOpen);
	};

	const toggleTag = (tagId: number) => {
		const nextTagIds = new Set(selectedTagIds);
		if (nextTagIds.has(tagId)) {
			nextTagIds.delete(tagId);
		} else {
			nextTagIds.add(tagId);
		}
		onSelectedTagIdsChange(nextTagIds);
	};

	const handleCancel = () => {
		setSearch("");
		onCancel();
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				{trigger ?? (
					<Button
						type="button"
						variant="secondary"
						role="combobox"
						aria-expanded={open}
						aria-label={`Edit tags. ${selectedTagIds.size} selected.`}
						disabled={disabled || isSubmitting}
					>
						<TagsIcon /> Tags ({selectedTagIds.size})
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent
				className="z-50 flex max-h-[min(24rem,calc(100dvh-2rem))] w-52 flex-col p-0 sm:w-60"
				portalled={false}
				align="start"
				avoidCollisions
				collisionBoundary={collisionBoundary}
				collisionPadding={8}
				onEscapeKeyDown={(event) => {
					if (isSubmitting) event.preventDefault();
				}}
				onInteractOutside={(event) => {
					if (isSubmitting) event.preventDefault();
				}}
			>
				<Command shouldFilter={false} className="min-h-0">
					<CommandInput
						placeholder="Search tags..."
						value={search}
						onValueChange={setSearch}
						disabled={disabled || isSubmitting}
					/>
					<CommandList className="min-h-0 max-h-60 overscroll-contain overflow-y-auto">
						{tags.length === 0 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No tags available.
							</p>
						) : filteredTags.length === 0 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No tags found.
							</p>
						) : (
							<CommandGroup heading="Tags">
								{filteredTags.map((tag) => {
									const selected = selectedTagIds.has(tag.tagId);
									const tagColor = tag.tagColor ?? "#666666";

									return (
										<CommandItem
											key={tag.tagId}
											value={String(tag.tagId)}
											onSelect={() => toggleTag(tag.tagId)}
											disabled={disabled || isSubmitting}
											className="justify-between"
										>
											<span className="flex min-w-0 items-center gap-2">
												<Checkbox
													checked={selected}
													aria-label={tag.tagName}
													tabIndex={-1}
													className="pointer-events-none"
												/>
												<span className="truncate">{tag.tagName}</span>
											</span>
											<span
												className="size-4 shrink-0 rounded-full border"
												style={{
													borderColor: tagColor,
													backgroundColor: tagColor,
												}}
											/>
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
					</CommandList>
				</Command>

				<div className="shrink-0 border-t border-input p-3">
					{error ? (
						<p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={handleCancel}
							disabled={disabled || isSubmitting}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={onApply}
							disabled={disabled || isSubmitting || !hasChanges}
						>
							{isSubmitting ? <Loader2 className="animate-spin" /> : null}
							Apply
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
