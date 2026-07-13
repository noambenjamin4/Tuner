"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";

// "More tools" hub: every file utility plus the music tools, one card each.
// File-tool cards ship in Phase 1; PDF/ZIP/video rows join as they land.
const FILE_TOOLS: { href: string; nameKey: DictKey; descKey: DictKey }[] = [
  { href: "/image-converter", nameKey: "tools.cardImageConvert", descKey: "tools.descImageConvert" },
  { href: "/compress-image", nameKey: "tools.cardImageCompress", descKey: "tools.descImageCompress" },
  { href: "/resize-image", nameKey: "tools.cardImageResize", descKey: "tools.descImageResize" },
  { href: "/resize-image-for-instagram", nameKey: "tools.cardInstagram", descKey: "tools.descInstagram" },
  { href: "/compress-image-to-100kb", nameKey: "tools.card100kb", descKey: "tools.desc100kb" },
  { href: "/heic-to-jpg", nameKey: "tools.cardHeicToJpg", descKey: "tools.descHeicToJpg" },
  { href: "/merge-pdf", nameKey: "tools.cardPdfMerge", descKey: "tools.descPdfMerge" },
  { href: "/split-pdf", nameKey: "tools.cardPdfSplit", descKey: "tools.descPdfSplit" },
  { href: "/jpg-to-pdf", nameKey: "tools.cardJpgToPdf", descKey: "tools.descJpgToPdf" },
  { href: "/unzip-files", nameKey: "tools.cardZip", descKey: "tools.descZip" },
  { href: "/compress-video", nameKey: "tools.cardVideo", descKey: "tools.descVideo" },
  { href: "/compress-video-for-discord", nameKey: "tools.cardDiscord", descKey: "tools.descDiscord" },
  { href: "/compress-video-for-whatsapp", nameKey: "tools.cardWhatsapp", descKey: "tools.descWhatsapp" },
  { href: "/video-converter", nameKey: "tools.cardVideoConvert", descKey: "tools.descVideoConvert" },
  { href: "/audio-converter", nameKey: "tools.cardAudioConvert", descKey: "tools.descAudioConvert" },
  { href: "/mkv-to-mp4", nameKey: "tools.cardMkvMp4", descKey: "tools.descMkvMp4" },
  { href: "/mov-to-mp4", nameKey: "tools.cardMovMp4", descKey: "tools.descMovMp4" },
  { href: "/flac-to-mp3", nameKey: "tools.cardFlacMp3", descKey: "tools.descFlacMp3" },
  { href: "/wav-to-mp3", nameKey: "tools.cardWavMp3", descKey: "tools.descWavMp3" },
];

export function ToolsHub({ extra }: { extra?: { href: string; nameKey: DictKey; descKey: DictKey }[] }) {
  const { t } = useI18n();
  const cards = [...FILE_TOOLS, ...(extra ?? [])];
  return (
    <article className="panel hero-tool">
      <div className="panel-heading hero-heading">
        <div>
          <h1>{t("tools.title")}</h1>
          <p>{t("tools.subtitle")}</p>
        </div>
      </div>

      <div className="tools-grid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="utility-card tools-card">
            <h3>{t(card.nameKey)}</h3>
            <p>{t(card.descKey)}</p>
          </Link>
        ))}
      </div>
    </article>
  );
}
