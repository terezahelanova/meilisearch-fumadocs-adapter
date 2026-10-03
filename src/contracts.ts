/**
 * A single search result, as rendered by the search dialog.
 */
export interface SortedResult<Content = string> {
  id: string;
  url: string;
  type: 'page' | 'heading' | 'text';
  content: Content;
  breadcrumbs?: Content[];
}

export interface PagedResults {
  results: SortedResult[];
  totalHits: number;
  totalPages: number;
  page: number;
}

export interface SearchQueryOptions {
  page?: number;
}

export interface SearchServer {
  search: (query: string, options?: SearchQueryOptions) => Promise<SortedResult[]>;
  export: () => Promise<unknown>;
}

/**
 * Returned by `createMeilisearchAPI`
 */
export interface SearchAPI extends SearchServer {
  GET: (request: Request) => Promise<Response>;
  staticGET: () => Promise<Response>;
}
