type PagedFetcher<TItem> = (
  pageSize: number,
  offset: number,
) => Promise<TItem[]>;

interface FetchAllPagedOptions {
  /** Items requested per backend call. Should match (or stay below) the backend's
   *  `Query(le=…)` cap. */
  pageSize?: number;
  /** Hard ceiling on iterations to guard against runaway loops or backend bugs.
   *  At pageSize=100 / maxPages=50 this caps the result at 5,000 items. */
  maxPages?: number;
  /** Logged when a page fetch fails so the silent fallback is observable. */
  resource?: string;
}

/**
 * Drains a paginated REST endpoint by repeatedly calling `fetcher` with
 * increasing `offset` values until it returns a partial page or empty result.
 *
 * Designed for sitemap-style "give me everything" workflows where the backend
 * still enforces a per-call `limit` cap. If a single page fails the helper
 * logs the error and returns whatever was collected so far rather than
 * propagating — partial sitemap is better than empty sitemap.
 */
export async function fetchAllPaged<TItem>(
  fetcher: PagedFetcher<TItem>,
  { pageSize = 100, maxPages = 50, resource = "items" }: FetchAllPagedOptions = {},
): Promise<TItem[]> {
  const collected: TItem[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    let batch: TItem[] | null = null;
    try {
      batch = await fetcher(pageSize, offset);
    } catch (error) {
      console.error(
        `[paginate] failed to fetch ${resource} page=${page} offset=${offset}:`,
        error,
      );
      break;
    }

    if (!batch || batch.length === 0) {
      break;
    }

    collected.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  return collected;
}
