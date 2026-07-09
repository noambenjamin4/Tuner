"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type SongRow = {
  slug: string;
  title: string;
  artist: string | null;
  bpm: number;
  key: string;
  camelot: string | null;
};

type SortKey = "recent" | "bpm-asc" | "bpm-desc" | "title";

// Client-side browser over the full song list. The list is server-rendered in
// the initial HTML (every link is crawlable); this just filters and sorts what
// is already there, turning the index into a usable key/BPM database.
export function SongBrowser({ songs }: { songs: SongRow[] }) {
  const [query, setQuery] = useState("");
  const [keyFilter, setKeyFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const keys = useMemo(
    () => Array.from(new Set(songs.map((s) => s.key))).sort(),
    [songs],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = songs.filter((s) => {
      if (keyFilter && s.key !== keyFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q) ||
        (s.camelot ?? "").toLowerCase() === q
      );
    });
    if (sort === "bpm-asc") list = [...list].sort((a, b) => a.bpm - b.bpm);
    else if (sort === "bpm-desc") list = [...list].sort((a, b) => b.bpm - a.bpm);
    else if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [songs, query, keyFilter, sort]);

  return (
    <div className="song-browser">
      <div className="song-filters">
        <input
          type="search"
          className="song-search"
          placeholder="Search by title, artist, or Camelot"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search songs"
        />
        <select
          className="song-select"
          value={keyFilter}
          onChange={(e) => setKeyFilter(e.target.value)}
          aria-label="Filter by key"
        >
          <option value="">All keys</option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          className="song-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort songs"
        >
          <option value="recent">Newest</option>
          <option value="bpm-asc">BPM: low to high</option>
          <option value="bpm-desc">BPM: high to low</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>

      <p className="song-count">
        {shown.length} {shown.length === 1 ? "song" : "songs"}
      </p>

      {shown.length === 0 ? (
        <p className="song-note">No songs match that filter.</p>
      ) : (
        <ul className="song-index">
          {shown.map((s) => (
            <li key={s.slug}>
              <Link href={`/song/${s.slug}`}>
                <span className="song-index-name">
                  {s.title}
                  {s.artist ? <span className="song-index-artist"> — {s.artist}</span> : null}
                </span>
                <span className="song-index-meta font-mono">
                  {s.key} · {Math.round(s.bpm)} BPM{s.camelot ? ` · ${s.camelot}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
