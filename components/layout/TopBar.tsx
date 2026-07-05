"use client";

import { useEffect, useRef, useState } from "react";
import { NavTabs } from "./NavTabs";
import { LanguageMenu } from "@/components/ui/LanguageMenu";
import { NOW_PLAYING_EVENT, isAnyAudioPlaying, type NowPlayingDetail } from "@/lib/audio/now-playing";

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPlaying(isAnyAudioPlaying());
    const onNowPlaying = (event: Event) => {
      const detail = (event as CustomEvent<NowPlayingDetail>).detail;
      setPlaying(Boolean(detail?.playing));
    };
    window.addEventListener(NOW_PLAYING_EVENT, onNowPlaying);
    return () => window.removeEventListener(NOW_PLAYING_EVENT, onNowPlaying);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      rootMargin: "-8px 0px 0px 0px",
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="scroll-sentinel" />
      <header className={`topbar${scrolled ? " scrolled" : ""}`}>
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="TuneBad home" onClick={() => setMenuOpen(false)}>
            <span className={`brand-logo-wrap${playing ? " spinning" : ""}`}>
              <picture>
                <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
                <img src="/logo-light.png" alt="" width={40} height={40} className="brand-logo" loading="eager" />
              </picture>
            </span>
            <span className="brand-wordmark">TUNEBAD</span>
          </a>

          <nav className="top-actions" aria-label="TuneBad tools">
            <NavTabs />
          </nav>

          <span className="lang-slot">
            <LanguageMenu variant="desktop" />
          </span>

          <button
            className="menu-toggle"
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {menuOpen ? (
          <div className="mobile-nav" role="menu">
            <NavTabs onNavigate={() => setMenuOpen(false)} />
            <LanguageMenu variant="mobile" />
          </div>
        ) : null}
      </header>
    </>
  );
}
