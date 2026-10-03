import { useCallback, useEffect, useRef, useState } from 'react';
import type { PagedResults, SortedResult } from './contracts';

export interface MeilisearchClientOptions {
  /**
   * Attribute name used for filtering.
   */
  filterAttribute?: string;
  /**
   * Concrete value of 'filterAttribute' to filter results by.
   */
  filterAttributeValue?: string;
  /**
   * Value of the 'language' attribute to restrict results to one locale.
   */
  language?: string;
  /**
   * Route of the search API endpoint, created with `createMeilisearchAPI`.
   *
   * @defaultValue `/api/meilisearch-search`
   */
  route?: string;
  /**
   * Route of the filters API endpoint.
   *
   * @defaultValue `/api/meilisearch-filters`
   */
  filtersRoute?: string;
}

export interface MeilisearchFilterOptions {
  /**
   * Attribute name used for filtering.
   */
  filterAttribute: string;
  /**
   * Route of the filters API endpoint.
   *
   * @defaultValue `/api/meilisearch-filters`
   */
  filtersRoute?: string;
}

function buildSearchUrl(query: string, page: number, options: MeilisearchClientOptions): URL {
  const {
    filterAttribute,
    filterAttributeValue,
    language,
    route = '/api/meilisearch-search',
  } = options;

  const url = new URL(route, window.location.origin);
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  if (filterAttribute) url.searchParams.set('filterAttribute', filterAttribute);
  if (filterAttributeValue) url.searchParams.set('filterAttributeValue', filterAttributeValue);
  if (language) url.searchParams.set('language', language);

  return url;
}

export async function meilisearchSearchPage(
  options: MeilisearchClientOptions,
  query: string,
  page = 1,
): Promise<PagedResults> {
  const res = await fetch(buildSearchUrl(query, page, options));
  if (!res.ok) throw new Error(await res.text());

  return (await res.json()) as PagedResults;
}

export async function meilisearchFilters({
  filterAttribute,
  filtersRoute = '/api/meilisearch-filters',
}: MeilisearchFilterOptions): Promise<string[]> {
  const url = new URL(filtersRoute, window.location.origin);

  if (filterAttribute) url.searchParams.set('filterAttribute', filterAttribute);
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const result = (await res.json()) as string[];

  return result;
}

function useDebounce<T>(value: T, delayMs = 100): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (delayMs === 0) return;
    const handler = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [delayMs, value]);

  if (delayMs === 0) return value;
  return debouncedValue;
}

/**
 * Return value of `useMeilisearchSearch` hook.
 * Equivalent to the result of `useDocsSearch` from `fumadocs-core`
 */
export interface MeilisearchDocsSearch {
  search: string;
  setSearch: (v: string) => void;
  query: {
    isLoading: boolean;
    data?: SortedResult[] | 'empty';
    error?: Error;
  };
  loadMore: () => void;
  isLoadingMore: boolean;
  hasMore: boolean;
}

/**
 * Equivalent to the `useDocsSearch` hook from from `fumadocs-core`
 */
export function useMeilisearchSearch(
  options: MeilisearchClientOptions,
  params: {
    /**
     * The debounced delay for performing a search (in ms).
     *
     * @defaultValue 100
     */
    delayMs?: number;
  } = {},
): MeilisearchDocsSearch {
  const { delayMs = 100 } = params;

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SortedResult[] | 'empty'>('empty');
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1 });

  const debouncedValue = useDebounce(search, delayMs);

  const optionsKey = JSON.stringify(options);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (debouncedValue.length === 0) {
      setResults('empty');
      setError(undefined);
      setIsLoading(false);
      setPageInfo({ page: 1, totalPages: 1 });
      return;
    }

    let interrupt = false;
    setIsLoading(true);

    (async () => {
      try {
        const firstPage = await meilisearchSearchPage(options, debouncedValue, 1);
        const res: SortedResult[] | 'empty' =
          firstPage.results.length > 0 ? firstPage.results : 'empty';
        const page = { page: firstPage.page, totalPages: firstPage.totalPages };

        if (interrupt) return;
        setResults(res);
        setPageInfo(page);
        setError(undefined);
      } catch (err) {
        if (!interrupt) setError(err as Error);
      } finally {
        if (!interrupt) setIsLoading(false);
      }
    })();

    return () => {
      interrupt = true;
    };
  }, [debouncedValue, optionsKey]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !debouncedValue || pageInfo.page >= pageInfo.totalPages) {
      return;
    }

    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    void meilisearchSearchPage(optionsRef.current, debouncedValue, pageInfo.page + 1)
      .then((next) => {
        setResults((current) => [...(current !== 'empty' ? current : []), ...next.results]);
        setPageInfo({ page: next.page, totalPages: next.totalPages });
      })
      .catch((err: unknown) => setError(err as Error))
      .finally(() => {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  }, [debouncedValue, pageInfo]);

  return {
    search,
    setSearch,
    query: {
      isLoading,
      data: results,
      error,
    },
    loadMore,
    isLoadingMore,
    hasMore: pageInfo.page < pageInfo.totalPages,
  };
}
