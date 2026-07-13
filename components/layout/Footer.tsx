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
        {/* File tools: standalone pages outside the SPA. */}
        <nav className="site-footer-tools" aria-label={t("nav.moreTools")}>
          <Link href="/tools">{t("nav.moreTools")}</Link>
          <Link href="/image-converter">{t("tools.cardImageConvert")}</Link>
          <Link href="/compress-image">{t("tools.cardImageCompress")}</Link>
          <Link href="/resize-image">{t("tools.cardImageResize")}</Link>
          <Link href="/resize-image-for-instagram">{t("tools.cardInstagram")}</Link>
          <Link href="/compress-image-to-100kb">{t("tools.card100kb")}</Link>
          <Link href="/heic-to-jpg">{t("tools.cardHeicToJpg")}</Link>
          <Link href="/merge-pdf">{t("tools.cardPdfMerge")}</Link>
          <Link href="/split-pdf">{t("tools.cardPdfSplit")}</Link>
          <Link href="/jpg-to-pdf">{t("tools.cardJpgToPdf")}</Link>
          <Link href="/unzip-files">{t("tools.cardZip")}</Link>
          <Link href="/compress-video">{t("tools.cardVideo")}</Link>
          <Link href="/compress-video-for-discord">{t("tools.cardDiscord")}</Link>
          <Link href="/compress-video-for-whatsapp">{t("tools.cardWhatsapp")}</Link>
          <Link href="/video-converter">{t("tools.cardVideoConvert")}</Link>
          <Link href="/audio-converter">{t("tools.cardAudioConvert")}</Link>
          <Link href="/mkv-to-mp4">{t("tools.cardMkvMp4")}</Link>
          <Link href="/mov-to-mp4">{t("tools.cardMovMp4")}</Link>
          <Link href="/flac-to-mp3">{t("tools.cardFlacMp3")}</Link>
          <Link href="/wav-to-mp3">{t("tools.cardWavMp3")}</Link>
          <Link href="/nightcore-maker">{t("tools.cardNightcore")}</Link>
          <Link href="/bass-booster">{t("tools.cardBassBooster")}</Link>
          <Link href="/8d-audio">{t("tools.card8dAudio")}</Link>
          <Link href="/audio-joiner">{t("tools.cardAudioJoiner")}</Link>
        </nav>
        {/* English guide articles; next/link prefetches these full navigations. */}
        <nav className="site-footer-tools site-footer-guides" aria-label={t("footer.guides")}>
          <Link href="/playlist-analyzer">Playlist analyzer</Link>
          <Link href="/camelot-wheel">Camelot wheel chart</Link>
          <Link href="/songs">Song database</Link>
          <Link href="/tunebad-vs-tunebat">TuneBad vs Tunebat</Link>
          <Link href="/guides/find-key-and-bpm-of-any-song">Key & BPM guide</Link>
          <Link href="/guides/camelot-wheel-harmonic-mixing">Camelot wheel</Link>
          <Link href="/guides/what-is-lufs-streaming-loudness">What is LUFS</Link>
          <Link href="/guides/how-to-make-slowed-and-reverb">Slowed + reverb guide</Link>
          <Link href="/guides/how-to-make-a-ringtone">Ringtone guide</Link>
        </nav>
        <p className="site-footer-copyright">{t("footer.copyright")}</p>
        <p className="site-footer-legal">
          <Link href="/copyright">{t("footer.copyrightLink")}</Link>
        </p>
      </div>
    </footer>
  );
}
