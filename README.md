# meilisearch-fumadocs-adapter

Meilisearch search adapter for [Fumadocs](https://fumadocs.dev) — community maintained, **not** an official Meilisearch or Fumadocs package.

Search results are built server-side from your Meilisearch index: hits are mapped into Fumadocs-style results, markdown/MDX is re-rendered around the `<mark>` highlight tags, code blocks are syntax-highlighted with Shiki, and results are paginated. The browser side is a React hook that feeds a search dialog.

## Install

```bash
npm install meilisearch-fumadocs-adapter meilisearch
```

`meilisearch` (the SDK) and `react` are peer dependencies — provide your own instances.

## Documented index

Each Meilisearch document is expected to have:

| Field        | Description                                      |
| ------------ | ------------------------------------------------ |
| `url`        | Page path, may include an anchor (`/docs#setup`) |
| `heading`    | Heading text of the section                      |
| `pageTitle`  | Title of the page (used as breadcrumb)           |
| `rawContent` | Section content in Markdown/MDX                  |
| `content`    | Section content as plain text                    |
| `language`   | Optional, for locale filtering                   |

## Server — create the API route

```ts
// app/api/meilisearch-search/route.ts
import { MeiliSearch } from 'meilisearch';
import { createMeilisearchAPI, createUrlNormalizer } from 'meilisearch-fumadocs-adapter';

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_API_KEY!,
});

export const GET = createMeilisearchAPI({
  indexUid: 'docs',
  client,
  // optional: restrict results to one facet value
  filterAttribute: 'site',
  filterAttributeValue: 'docs',
  // optional: restrict results to one locale
  language: 'en',
  // optional: rewrite indexed URLs into site routes
  transformUrl: createUrlNormalizer({ locales: ['cz', 'en'], basePath: '/docs' }),
});
```

`createMeilisearchAPI` returns a `SearchAPI` whose `GET` handler is directly usable as a route handler in Next.js (App Router, Route Handlers) or any `Request`/`Response`-based framework.

Query parameters accepted by the endpoint:

| Param   | Description                                          |
| ------- | ---------------------------------------------------- |
| `query` | Search query (required; empty returns an empty page) |
| `page`  | 1-based page number                                  |

Filtering and locale restriction are configured **server-side** via `MeilisearchOptions` above, not per-request.

### Filters endpoint (optional)

To power a facet filter dropdown in the UI:

```ts
// app/api/meilisearch-filters/route.ts
import { MeiliSearch } from 'meilisearch';
import { fetchFilters } from 'meilisearch-fumadocs-adapter';

export const GET = async (request: Request) => {
  const values = await fetchFilters({
    indexUid: 'docs',
    client: new MeiliSearch({ host: ..., apiKey: ... }),
    filterAttribute: 'site',
  });
  return Response.json(values);
};
```

## Client — the search hook

```tsx
'use client';
import { useMeilisearchSearch } from 'meilisearch-fumadocs-adapter/client';

export function MySearchDialog() {
  const { search, setSearch, query, loadMore, isLoadingMore, hasMore } = useMeilisearchSearch({
    route: '/api/meilisearch-search',
    filtersRoute: '/api/meilisearch-filters',
  });

  if (query.isLoading) return <p>Searching…</p>;
  if (query.error) return <p>{query.error.message}</p>;

  const results = query.data === 'empty' || !query.data ? [] : query.data;

  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {results.map((r) => (
          <li key={r.id}>
            <a href={r.url}>
              {r.breadcrumbs?.join(' / ')} — {r.content}
            </a>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button onClick={loadMore} disabled={isLoadingMore}>
          Load more
        </button>
      )}
    </>
  );
}
```

`content` is sanitized HTML containing `<mark>` elements for query matches and, for code hits, a Shiki-highlighted block — render it with `dangerouslySetInnerHTML`.

### `useMeilisearchSearch(options, params)`

`params`:

- `delayMs` — debounce for the query, default `100`
- `allowEmpty` — search on an empty query, default `false`

Returns `MeilisearchDocsSearch`:

- `search`, `setSearch` — the current query
- `query` — `{ isLoading, data, error }`; `data` is `SortedResult[]` or `'empty'`
- `loadMore`, `isLoadingMore`, `hasMore` — pagination

Each `SortedResult` has `id`, `url`, `type` (`page` | `heading` | `text`), `content` (HTML), and `breadcrumbs`.

### Lower-level client functions

```ts
import { meilisearchSearchPage, meilisearchFilters } from 'meilisearch-fumadocs-adapter/client';

const page = await meilisearchSearchPage(options, 'install', 1);
// { results, totalHits, totalPages, page }

const values = await meilisearchFilters({ filterAttribute: 'site' });
// string[]
```

## Development

```bash
pnpm install
pnpm dev          # watch build
pnpm check        # types:check + lint + format:check
pnpm build        # emit dist/
pnpm test         # vitest
```

## License

MIT
