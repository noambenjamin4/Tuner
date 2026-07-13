"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type SearchRow = {
  slug: string;
  title: string;
  artist: string | null;
  key_name: string;
  camelot: string | null;
  bpm: number;
};

// Full-catalog search island for /songs: the static list below only renders
// the latest 2000 songs, so this hits GET /api/songs?q= for anything older or
// off the first page. Debounced, self-contained — clearing the input just
// hides these results again and leaves the static list untouched.
export function SongSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      fetch(`/api/songs?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : { songs: [] }))
        .then((data: { songs?: SearchRow[] }) => {
          if (requestId.current !== id) return; // a newer keystroke superseded this request
          setResults(data.songs ?? []);
        })
        .catch(() => {
          if (requestId.current === id) setResults([]);
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <section className="song-section song-search-section">
      <input
        type="search"
        className="song-search"
        placeholder="Search the full database by title or artist"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search all songs"
      />

      {results !== null && !loading && results.length === 0 ? (
        <p className="song-note">No matches for &ldquo;{query.trim()}&rdquo;.</p>
      ) : null}

      {results && results.length > 0 ? (
        <ul className="song-index">
          {results.map((s) => (
            <li key={s.slug}>
              <Link href={`/song/${s.slug}`}>
                <span className="song-index-name">
                  {s.title}
                  {s.artist ? <span className="song-index-artist"> — {s.artist}</span> : null}
                </span>
                <span className="song-index-meta font-mono">
                  {s.key_name} · {Math.round(s.bpm)} BPM{s.camelot ? ` · ${s.camelot}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
