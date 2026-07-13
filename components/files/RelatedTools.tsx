"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";

// "Related tools" row at the bottom of every standalone file-tool page: a few
// sibling utilities plus one card back to the music side of TuneBad. A client
// component only for i18n — the I18nProvider SSRs English, so the links and
// copy land in the server HTML for crawlers. Card names/descriptions reuse
// the ToolsHub keys so the two surfaces can never drift apart.
export type RelatedSlug =
  | "image-converter"
  | "compress-image"
  | "resize-image"
  | "resize-image-for-instagram"
  | "compress-image-to-100kb"
  | "heic-to-jpg"
  | "merge-pdf"
  | "jpg-to-pdf"
  | "unzip-files"
  | "compress-video"
  | "compress-video-for-discord"
  | "compress-video-for-whatsapp"
  | "video-converter"
  | "audio-converter"
  | "split-pdf"
  | "mkv-to-mp4"
  | "mov-to-mp4"
  | "flac-to-mp3"
  | "wav-to-mp3"
  | "nightcore-maker"
  | "bass-booster"
  | "8d-audio"
  | "audio-joiner"
  | "audio-mastering";

const REGISTRY: Record<RelatedSlug, { nameKey: DictKey; descKey: DictKey }> = {
  "image-converter": { nameKey: "tools.cardImageConvert", descKey: "tools.descImageConvert" },
  "compress-image": { nameKey: "tools.cardImageCompress", descKey: "tools.descImageCompress" },
  "resize-image": { nameKey: "tools.cardImageResize", descKey: "tools.descImageResize" },
  "resize-image-for-instagram": { nameKey: "tools.cardInstagram", descKey: "tools.descInstagram" },
  "compress-image-to-100kb": { nameKey: "tools.card100kb", descKey: "tools.desc100kb" },
  "heic-to-jpg": { nameKey: "tools.cardHeicToJpg", descKey: "tools.descHeicToJpg" },
  "merge-pdf": { nameKey: "tools.cardPdfMerge", descKey: "tools.descPdfMerge" },
  "jpg-to-pdf": { nameKey: "tools.cardJpgToPdf", descKey: "tools.descJpgToPdf" },
  "unzip-files": { nameKey: "tools.cardZip", descKey: "tools.descZip" },
  "compress-video": { nameKey: "tools.cardVideo", descKey: "tools.descVideo" },
  "compress-video-for-discord": { nameKey: "tools.cardDiscord", descKey: "tools.descDiscord" },
  "compress-video-for-whatsapp": { nameKey: "tools.cardWhatsapp", descKey: "tools.descWhatsapp" },
  "video-converter": { nameKey: "tools.cardVideoConvert", descKey: "tools.descVideoConvert" },
  "audio-converter": { nameKey: "tools.cardAudioConvert", descKey: "tools.descAudioConvert" },
  "split-pdf": { nameKey: "tools.cardPdfSplit", descKey: "tools.descPdfSplit" },
  "mkv-to-mp4": { nameKey: "tools.cardMkvMp4", descKey: "tools.descMkvMp4" },
  "mov-to-mp4": { nameKey: "tools.cardMovMp4", descKey: "tools.descMovMp4" },
  "flac-to-mp3": { nameKey: "tools.cardFlacMp3", descKey: "tools.descFlacMp3" },
  "wav-to-mp3": { nameKey: "tools.cardWavMp3", descKey: "tools.descWavMp3" },
  "nightcore-maker": { nameKey: "tools.cardNightcore", descKey: "tools.descNightcore" },
  "bass-booster": { nameKey: "tools.cardBassBooster", descKey: "tools.descBassBooster" },
  "8d-audio": { nameKey: "tools.card8dAudio", descKey: "tools.desc8dAudio" },
  "audio-joiner": { nameKey: "tools.cardAudioJoiner", descKey: "tools.descAudioJoiner" },
  "audio-mastering": { nameKey: "tools.cardMastering", descKey: "tools.descMastering" },
};

export function RelatedTools({ tools }: { tools: RelatedSlug[] }) {
  const { t } = useI18n();
  return (
    <nav className="related-tools" aria-label="Related tools">
      <h2 className="related-heading">{t("related.heading")}</h2>
      <div className="related-grid">
        {tools.map((slug) => {
          const card = REGISTRY[slug];
          return (
            <Link key={slug} href={`/${slug}`} className="utility-card tools-card related-card">
              <h3>{t(card.nameKey)}</h3>
              <p>{t(card.descKey)}</p>
            </Link>
          );
        })}
        <Link href="/" className="utility-card tools-card related-card">
          <h3>{t("related.musicName")}</h3>
          <p>{t("related.musicDesc")}</p>
        </Link>
      </div>
    </nav>
  );
}
