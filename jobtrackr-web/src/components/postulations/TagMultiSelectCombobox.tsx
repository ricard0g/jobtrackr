import { ChevronDown, Loader2, Plus, Tags as TagsIcon } from "lucide-react";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Tag, TagCategory, TagWriteRequest } from "@/types/tag";

export type TagMultiSelectComboboxProps = {
	tags: Tag[];
	selectedTagIds: ReadonlySet<number>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectedTagIdsChange: (ids: Set<number>) => void;
	onApply: () => void;
	onCancel: () => void;
	onCreateTag: (request: TagWriteRequest) => void;
	disabled?: boolean;
	isSubmitting?: boolean;
	isCreatingTag?: boolean;
	error?: string;
	createTagError?: string;
	createdTag?: Tag;
	trigger?: ReactNode;
	collisionBoundary?: Element | null;
};

const tagCategoryOptions: Array<{ value: TagCategory; label: string }> = [
	{ value: "TECH_STACK", label: "Tech stack" },
	{ value: "COMPANY_TYPE", label: "Company type" },
	{ value: "MODALITY", label: "Modality" },
	{ value: "OTHER", label: "Other" },
];

const DEFAULT_TAG_COLOR = "#3B82F6";
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

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
	onCreateTag,
	disabled = false,
	isSubmitting = false,
	isCreatingTag = false,
	error,
	createTagError,
	createdTag,
	trigger,
	collisionBoundary,
}: TagMultiSelectComboboxProps) {
	const [search, setSearch] = useState("");
	const [tagCategory, setTagCategory] = useState<TagCategory>("OTHER");
	const [tagName, setTagName] = useState("");
	const [tagColor, setTagColor] = useState(DEFAULT_TAG_COLOR);
	const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
	const [createValidationError, setCreateValidationError] = useState<string>();
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
	const isBusy = disabled || isSubmitting || isCreatingTag;
	const displayedCreateError = createValidationError ?? createTagError;

	useEffect(() => {
		if (!createdTag) return;

		queueMicrotask(() => {
			setTagCategory("OTHER");
			setTagName("");
			setTagColor(DEFAULT_TAG_COLOR);
			setIsCreateFormOpen(false);
			setCreateValidationError(undefined);
		});
	}, [createdTag]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			setInitialSelectedTagIds(new Set(selectedTagIds));
			setSearch("");
			setIsCreateFormOpen(false);
		} else {
			setSearch("");
			setIsCreateFormOpen(false);
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
		setIsCreateFormOpen(false);
		onCancel();
	};

	const handleCreateTag = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		event.stopPropagation();

		const trimmedTagName = tagName.trim();
		if (!trimmedTagName) {
			setCreateValidationError("Enter a tag name.");
			return;
		}
		if (!HEX_COLOR_PATTERN.test(tagColor)) {
			setCreateValidationError("Use a hex color in #RRGGBB format.");
			return;
		}

		setCreateValidationError(undefined);
		onCreateTag({
			tagCategory,
			tagName: trimmedTagName,
			tagColor,
		});
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
						disabled={isBusy}
					>
						<TagsIcon /> Tags ({selectedTagIds.size})
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent
				className="z-50 flex max-h-[26rem] sm:max-h-[24rem]  w-[18.75rem] sm:w-[21rem] max-w-[calc(100vw-2rem)] flex-col p-0"
				portalled={false}
				align="start"
				avoidCollisions
				collisionBoundary={collisionBoundary}
				collisionPadding={8}
				onEscapeKeyDown={(event) => {
					if (isBusy) event.preventDefault();
				}}
				onInteractOutside={(event) => {
					if (isBusy) event.preventDefault();
				}}
			>
				<Command shouldFilter={false} className="min-h-0">
					<CommandInput
						placeholder="Search tags..."
						value={search}
						onValueChange={setSearch}
						disabled={isBusy}
					/>
					<CommandList className="min-h-0 max-h-80 overscroll-contain overflow-y-auto">
						<CommandGroup heading="Action">
							<CommandItem
								value="add-tag-action"
								onSelect={() => setIsCreateFormOpen((current) => !current)}
								disabled={isBusy}
								aria-expanded={isCreateFormOpen}
								className="justify-between"
							>
								<span className="flex items-center gap-2">
									<Plus />
									Add Tag
								</span>
								<ChevronDown
									className={
										isCreateFormOpen
											? "rotate-180 transition-transform"
											: "transition-transform"
									}
								/>
							</CommandItem>
							{isCreateFormOpen ? (
								<form
									className="space-y-2 px-2 pb-2 pt-1"
									onSubmit={handleCreateTag}
								>
									<div className="grid gap-2 sm:grid-cols-[minmax(7rem,0.9fr)_minmax(8rem,1.4fr)]">
									<Select
										value={tagCategory}
										onValueChange={(value) => {
											setTagCategory(value as TagCategory);
											setCreateValidationError(undefined);
										}}
										disabled={isBusy}
									>
										<SelectTrigger className="h-8" aria-label="Tag category">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{tagCategoryOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Input
										type="text"
										value={tagName}
										onChange={(event) => {
											setTagName(event.target.value);
											setCreateValidationError(undefined);
										}}
										placeholder="Tag name"
										aria-label="Tag name"
										maxLength={100}
										disabled={isBusy}
										className="h-8"
									/>
									</div>
									<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_2.25rem_auto]">
									<Input
										type="text"
										value={tagColor}
										onChange={(event) => {
											setTagColor(event.target.value);
											setCreateValidationError(undefined);
										}}
										placeholder="#3B82F6"
										aria-label="Tag hex color"
										maxLength={7}
										disabled={isBusy}
										className="h-8 font-mono uppercase"
									/>
									<Input
										type="color"
										value={
											HEX_COLOR_PATTERN.test(tagColor)
												? tagColor
												: DEFAULT_TAG_COLOR
										}
										onChange={(event) => {
											setTagColor(event.target.value.toUpperCase());
											setCreateValidationError(undefined);
										}}
										aria-label="Choose tag color"
										disabled={isBusy}
										className="h-8 w-full cursor-pointer p-1"
									/>
									<Button
										type="submit"
										size="sm"
										disabled={isBusy}
										aria-label="Create tag"
										className="w-full sm:w-auto"
									>
										{isCreatingTag ? (
											<Loader2 className="animate-spin" />
										) : (
											<Plus />
										)}
										Add
									</Button>
									</div>
									{displayedCreateError ? (
										<p className="text-xs text-destructive" role="alert">
											{displayedCreateError}
										</p>
									) : null}
								</form>
							) : null}
						</CommandGroup>
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
											disabled={isBusy}
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
							disabled={isBusy}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={onApply}
							disabled={isBusy || !hasChanges}
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
