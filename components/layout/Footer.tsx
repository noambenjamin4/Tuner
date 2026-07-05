"use client";

import Link from "next/link";
import { VIEW_TO_PATH, type ViewName } from "../TunebadApp";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";

// Crawlable links to every indexable tool page, labeled with the existing
// nav.* keys (already translated in all 8 locales). /history is noindex, so
// it's intentionally not listed here.
const TOOL_LINKS: { page: ViewName; labelKey: DictKey }[] = [
  { page: "analysis", labelKey: "nav.analysis" },
  { page: "converter", labelKey: "nav.converter" },
  { page: "loudness", labelKey: "nav.loudness" },
  { page: "remix", labelKey: "nav.remix" },
  { page: "cutter", labelKey: "nav.cutter" },
  { page: "pitch", labelKey: "nav.pitch" },
  { page: "delay", labelKey: "nav.delay" },
  { page: "bpm", labelKey: "nav.bpm" },
];

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
            <img src="/logo-light.png" alt="" width={24} height={24} className="site-footer-logo" loading="lazy" />
          </picture>
          <span className="site-footer-wordmark">TUNEBAD</span>
        </div>
        <p className="site-footer-tagline">{t("footer.tagline")}</p>
        <nav className="site-footer-tools" aria-label="Tools">
          {TOOL_LINKS.map((tool) => (
            <a key={tool.page} href={VIEW_TO_PATH[tool.page]}>
              {t(tool.labelKey)}
            </a>
          ))}
        </nav>
        {/* English guide articles; next/link prefetches these full navigations. */}
        <nav className="site-footer-tools site-footer-guides" aria-label={t("footer.guides")}>
          <Link href="/guides/find-key-and-bpm-of-any-song">Key & BPM guide</Link>
          <Link href="/guides/camelot-wheel-harmonic-mixing">Camelot wheel</Link>
          <Link href="/guides/what-is-lufs-streaming-loudness">What is LUFS</Link>
          <Link href="/guides/how-to-make-slowed-and-reverb">Slowed + reverb guide</Link>
        </nav>
        <p className="site-footer-copyright">{t("footer.copyright")}</p>
        <p className="site-footer-legal">
          <Link href="/copyright">{t("footer.copyrightLink")}</Link>
        </p>
      </div>
    </footer>
  );
}
