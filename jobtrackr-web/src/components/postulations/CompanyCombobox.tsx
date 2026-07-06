import { CheckIcon, ChevronDownIcon, Loader2 } from "lucide-react";
import { useState, type UIEvent } from "react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCompanySearch } from "@/hooks/use-company-search";
import { cn } from "@/lib/utils";
import type { Company } from "@/types/company";

type CompanyComboboxProps = {
	value: string;
	selectedCompany: Company | null;
	onChange: (companyId: string, company: Company) => void;
	disabled?: boolean;
	invalid?: boolean;
	placeholder?: string;
};

const SCROLL_LOAD_THRESHOLD = 0.8;

export function CompanyCombobox({
	value,
	selectedCompany,
	onChange,
	disabled = false,
	invalid = false,
	placeholder = "Select company",
}: CompanyComboboxProps) {
	const [open, setOpen] = useState(false);
	const {
		search,
		setSearch,
		companies,
		isLoading,
		isLoadingMore,
		hasMore,
		error,
		loadMore,
		reset,
	} = useCompanySearch({ enabled: open });

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			reset();
		}
	};

	const handleScroll = (event: UIEvent<HTMLDivElement>) => {
		const list = event.currentTarget;
		const scrollProgress =
			(list.scrollTop + list.clientHeight) / list.scrollHeight;

		if (scrollProgress >= SCROLL_LOAD_THRESHOLD) {
			loadMore();
		}
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-invalid={invalid}
					disabled={disabled}
					className={cn(
						"h-9 w-full justify-between rounded-lg border-input bg-transparent px-3 py-2 font-normal shadow-xs hover:bg-transparent",
						!selectedCompany && "text-muted-foreground",
						invalid && "border-destructive ring-3 ring-destructive/20",
					)}
				>
					<span className="truncate">
						{selectedCompany?.companyName ?? placeholder}
					</span>
					<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search companies..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList onScroll={handleScroll}>
						{isLoading && companies.length === 0 ? (
							<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Loading companies...
							</div>
						) : null}

						{!isLoading && companies.length === 0 ? (
							<CommandEmpty>
								{error ?? "No companies found."}
							</CommandEmpty>
						) : null}

						{companies.map((company) => (
							<CommandItem
								key={company.companyId}
								value={String(company.companyId)}
								onSelect={() => {
									onChange(String(company.companyId), company);
									setOpen(false);
								}}
							>
								<CheckIcon
									className={cn(
										"size-4",
										value === String(company.companyId)
											? "opacity-100"
											: "opacity-0",
									)}
								/>
								<span className="truncate">{company.companyName}</span>
							</CommandItem>
						))}

						{hasMore ? (
							<div className="border-t border-input p-1">
								<Button
									type="button"
									variant="ghost"
									className="h-8 w-full justify-center text-sm"
									disabled={isLoadingMore}
									onClick={loadMore}
								>
									{isLoadingMore ? (
										<>
											<Loader2 className="size-4 animate-spin" />
											Loading more...
										</>
									) : (
										"Load more"
									)}
								</Button>
							</div>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
