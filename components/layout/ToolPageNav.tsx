"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";
import { LanguageMenu } from "@/components/ui/LanguageMenu";

// Top nav for the standalone tool pages (/tools, /audio-mastering, and every
// file-tool page). They live OUTSIDE the SPA, so they can't use NavTabs (which
// depends on useTunebad). This mirrors the main TopBar's look and responsive
// behavior — inline tabs on desktop, a hamburger drawer on mobile, reusing the
// same .topbar / .top-actions / .menu-toggle / .mobile-nav CSS — but every item
// is a plain link to the tool's real route so a visitor can jump between tools
// without going back through the logo/home.
const LINKS: { href: string; labelKey: DictKey }[] = [
  { href: "/converter", labelKey: "nav.converter" },
  { href: "/key-bpm-finder", labelKey: "nav.analysis" },
  { href: "/delay-reverb-calculator", labelKey: "nav.delay" },
  { href: "/bpm-tap", labelKey: "nav.bpm" },
  { href: "/pitch-shifter", labelKey: "nav.pitch" },
  { href: "/loudness", labelKey: "nav.loudness" },
  { href: "/slowed-reverb", labelKey: "nav.remix" },
  { href: "/mp3-cutter", labelKey: "nav.cutter" },
  { href: "/audio-mastering", labelKey: "nav.mastering" },
  { href: "/history", labelKey: "nav.history" },
  { href: "/tools", labelKey: "nav.moreTools" },
];

// The file-tool pages (nightcore, bass-booster, converters, etc.) aren't their
// own nav item; they live under "More tools", so that item lights up on them.
const KNOWN_HREFS = new Set(LINKS.map((link) => link.href));

export function ToolPageNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  // Close the mobile drawer on Escape, matching the language menu's behavior.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Fresh elements per call so the desktop nav and the mobile drawer don't share
  // element instances.
  const renderLinks = () =>
    LINKS.map((link) => {
      const active = pathname === link.href || (link.href === "/tools" && !KNOWN_HREFS.has(pathname));
      return (
        <a
          key={link.href}
          className={`ghost-button${active ? " active" : ""}`}
          href={link.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          {t(link.labelKey)}
        </a>
      );
    });

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="scroll-sentinel" />
      <header className={`topbar${scrolled ? " scrolled" : ""}`}>
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="TuneBad home" onClick={() => setMenuOpen(false)}>
            <span className="brand-logo-wrap">
              <picture>
                <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
                <img src="/logo-light.png" alt="" width={40} height={40} className="brand-logo" loading="eager" />
              </picture>
            </span>
            <span className="brand-wordmark">TUNEBAD</span>
          </a>

          <nav className="top-actions" aria-label="TuneBad tools">
            {renderLinks()}
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
          <div className="mobile-nav">
            {renderLinks()}
            <LanguageMenu variant="mobile" />
          </div>
        ) : null}
      </header>
    </>
  );
}
