import Link from "next/link";

// Shared pagination for the song hubs (key / camelot / bpm).
//
// This is a crawl surface first and a UI second: the hub readers are capped at
// PAGE_SIZE rows, so before pagination the union of every hub reached only ~8%
// of the catalog and ~109,000 song pages had no internal inbound links at all.
// The numbered window matters — it lets a crawler reach page 13 directly
// instead of walking next -> next -> next twelve times.
export const HUB_PAGE_SIZE = 300;

/** Page 1 lives at the bare hub URL; page N at <base>/page/N. */
export function hubHref(base: string, page: number): string {
  return page <= 1 ? base : `${base}/page/${page}`;
}

export function HubPagination({
  base,
  page,
  totalPages,
  label,
}: {
  base: string;
  page: number;
  totalPages: number;
  label: string;
}) {
  if (totalPages <= 1) return null;

  // A compact window around the current page, always including first and last.
  const windowed: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p += 1) windowed.push(p);
  if (!windowed.includes(1)) windowed.unshift(1);
  if (!windowed.includes(totalPages)) windowed.push(totalPages);

  return (
    <nav className="song-pagination" aria-label={label}>
      {page > 1 && (
        <Link href={hubHref(base, page - 1)} rel="prev" className="song-page-link">
          ← Previous
        </Link>
      )}
      <span className="song-page-numbers">
        {windowed.map((p) =>
          p === page ? (
            <span key={p} className="song-page-num active" aria-current="page">
              {p}
            </span>
          ) : (
            <Link key={p} href={hubHref(base, p)} className="song-page-num">
              {p}
            </Link>
          ),
        )}
      </span>
      {page < totalPages && (
        <Link href={hubHref(base, page + 1)} rel="next" className="song-page-link">
          Next →
        </Link>
      )}
    </nav>
  );
}
