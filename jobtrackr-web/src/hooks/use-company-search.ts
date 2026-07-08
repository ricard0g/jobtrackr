import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";
import type { Company } from "@/types/company";

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type UseCompanySearchOptions = {
	enabled: boolean;
	pageSize?: number;
};

const mergeCompanies = (current: Company[], next: Company[]) => {
	const seenIds = new Set(current.map((company) => company.companyId));
	const merged = [...current];

	for (const company of next) {
		if (seenIds.has(company.companyId)) continue;
		seenIds.add(company.companyId);
		merged.push(company);
	}

	return merged;
};

export function useCompanySearch({
	enabled,
	pageSize = DEFAULT_PAGE_SIZE,
}: UseCompanySearchOptions) {
	const [search, setSearchState] = useState("");
	const [companies, setCompanies] = useState<Company[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [isDebouncing, setIsDebouncing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const abortControllerRef = useRef<AbortController | null>(null);
	const requestIdRef = useRef(0);
	const searchRef = useRef(search);

	const hasMore = companies.length < total;

	useEffect(() => {
		searchRef.current = search;
	}, [search]);

	const reset = useCallback(() => {
		abortControllerRef.current?.abort();
		requestIdRef.current += 1;
		setSearchState("");
		setCompanies([]);
		setTotal(0);
		setError(null);
		setIsLoading(false);
		setIsLoadingMore(false);
		setIsDebouncing(false);
	}, []);

	const setSearch = useCallback((value: string) => {
		abortControllerRef.current?.abort();
		requestIdRef.current += 1;
		setSearchState(value);
		setCompanies([]);
		setTotal(0);
		setError(null);
		setIsLoadingMore(false);
		setIsDebouncing(true);
	}, []);

	const fetchPage = useCallback(
		async ({
			searchQuery,
			nextPage,
			append,
		}: {
			searchQuery: string;
			nextPage: number;
			append: boolean;
		}) => {
			abortControllerRef.current?.abort();
			const abortController = new AbortController();
			abortControllerRef.current = abortController;
			const requestId = requestIdRef.current + 1;
			requestIdRef.current = requestId;

			if (append) {
				setIsLoadingMore(true);
			} else {
				setIsLoading(true);
				setCompanies([]);
			}
			setError(null);

			try {
				const response = await api.searchCompanies({
					search: searchQuery,
					page: nextPage,
					size: pageSize,
					signal: abortController.signal,
				});

				if (requestId !== requestIdRef.current) return;

				setTotal(response.total);
				setCompanies((currentCompanies) =>
					append
						? mergeCompanies(currentCompanies, response.items)
						: response.items,
				);
			} catch (fetchError) {
				if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
					return;
				}

				if (requestId !== requestIdRef.current) return;

				setError(
					fetchError instanceof ApiError
						? fetchError.message
						: "Could not load companies.",
				);

				if (!append) {
					setCompanies([]);
					setTotal(0);
				}
			} finally {
				if (requestId === requestIdRef.current) {
					setIsLoading(false);
					setIsLoadingMore(false);
				}
			}
		},
		[pageSize],
	);

	useEffect(() => {
		if (!enabled) return;

		const timeoutId = window.setTimeout(() => {
			setIsDebouncing(false);
			void fetchPage({ searchQuery: search, nextPage: 0, append: false });
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [enabled, fetchPage, search]);

	useEffect(
		() => () => {
			abortControllerRef.current?.abort();
		},
		[],
	);

	const loadMore = useCallback(() => {
		if (!enabled || isLoading || isLoadingMore || isDebouncing || !hasMore) return;

		const nextPage = Math.floor(companies.length / pageSize);
		void fetchPage({
			searchQuery: searchRef.current,
			nextPage,
			append: true,
		});
	}, [
		companies.length,
		enabled,
		fetchPage,
		hasMore,
		isDebouncing,
		isLoading,
		isLoadingMore,
		pageSize,
	]);

	return {
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
	};
};
