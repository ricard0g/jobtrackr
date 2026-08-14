import { CheckIcon, ChevronDownIcon, Loader2, Plus } from "lucide-react";
import { useState, type UIEvent } from "react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
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
import { useCompanySearch } from "@/hooks/use-company-search";
import { ApiError, api } from "@/lib/api";
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
const COMPANY_NAME_MAX_LENGTH = 255;

const createCompanyErrorMessage = (error: unknown) => {
    if (error instanceof ApiError && error.code === "DUPLICATE_COMPANY_NAME") {
        return "A company with this name already exists.";
    }

    if (error instanceof ApiError) {
        return error.message;
    }

    return "Could not create the company.";
};

export function CompanyCombobox({
    value,
    selectedCompany,
    onChange,
    disabled = false,
    invalid = false,
    placeholder = "Select company",
}: CompanyComboboxProps) {
    const [open, setOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const {
        search,
        setSearch,
        companies,
        isLoading,
        isLoadingMore,
        isDebouncing,
        hasMore,
        error,
        loadMore,
        reset,
    } = useCompanySearch({ enabled: open });

    const isSearchPending = isLoading || isDebouncing;
    const showInitialLoading = isSearchPending && companies.length === 0;
    const showRefetchLoading = isLoading && companies.length > 0;
    const trimmedSearch = search.trim();
    const showCreateCompany =
        !isSearchPending &&
        companies.length === 0 &&
        trimmedSearch.length > 0 &&
        !error;

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        setCreateError(null);
        if (!nextOpen) {
            setIsCreating(false);
            reset();
        }
    };

    const handleSearchChange = (nextSearch: string) => {
        setCreateError(null);
        setSearch(nextSearch);
    };

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        const list = event.currentTarget;
        if (list.scrollHeight <= list.clientHeight) {
            loadMore();
            return;
        }

        const scrollProgress =
            (list.scrollTop + list.clientHeight) / list.scrollHeight;

        if (scrollProgress >= SCROLL_LOAD_THRESHOLD) {
            loadMore();
        }
    };

    const handleCreateCompany = async () => {
        if (!showCreateCompany || isCreating) return;

        if (trimmedSearch.length > COMPANY_NAME_MAX_LENGTH) {
            setCreateError("Company name must be 255 characters or fewer.");
            return;
        }

        setIsCreating(true);
        setCreateError(null);

        try {
            const company = await api.createCompany({ companyName: trimmedSearch });
            onChange(String(company.companyId), company);
            handleOpenChange(false);
        } catch (createCompanyError) {
            setCreateError(createCompanyErrorMessage(createCompanyError));
        } finally {
            setIsCreating(false);
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
            <PopoverContent className="p-0 z-50" portalled={false}>
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search companies..."
                        value={search}
                        onValueChange={handleSearchChange}
                        disabled={isCreating}
                    />
                    <CommandList className="max-h-60 overscroll-contain overflow-y-auto" onScroll={handleScroll}>
                        {showInitialLoading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                Loading companies...
                            </div>
                        ) : null}

                        {!isSearchPending && companies.length === 0 ? (
                            <CommandEmpty>
                                {error ?? "No companies found."}
                            </CommandEmpty>
                        ) : null}

                        <CommandGroup heading="companies">
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
                        </CommandGroup>

                        {showRefetchLoading ? (
                            <div className="flex items-center justify-center gap-2 border-t border-input py-2 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                Searching...
                            </div>
                        ) : null}

                        {hasMore ? (
                            <div className="border-t border-input p-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-8 w-full justify-center text-sm"
                                    disabled={isLoadingMore || isSearchPending || isCreating}
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

                        {showCreateCompany ? (
                            <div className="border-t border-input p-1">
                                {createError ? (
                                    <p className="px-2 py-1 text-xs text-destructive" role="alert">
                                        {createError}
                                    </p>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-8 w-full justify-start gap-2 text-sm"
                                    disabled={isCreating || disabled}
                                    onClick={() => {
                                        void handleCreateCompany();
                                    }}
                                >
                                    {isCreating ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Plus className="size-4" />
                                    )}
                                    <span className="truncate">Create "{trimmedSearch}"</span>
                                </Button>
                            </div>
                        ) : null}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
