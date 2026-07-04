"use client";

import { YouTubeDownloader } from "./YouTubeDownloader";
import { LocalFileConverter } from "./LocalFileConverter";
import { useI18n } from "@/lib/i18n";
import { DownloadIcon } from "@/components/ui/icons";
import { downloaderVisible } from "@/lib/runtime.client";

export function ConverterView() {
  const { t } = useI18n();
  return (
    <article className="panel hero-tool converter-panel" id="converter">
      <div className="panel-heading hero-heading">
        <div>
          <h1>
            <DownloadIcon className="panel-title-icon" />
            {downloaderVisible ? t("converter.title") : t("converter.titleLocalOnly")}
          </h1>
          <p>{downloaderVisible ? t("converter.subtitle") : t("converter.subtitleLocalOnly")}</p>
        </div>
      </div>
      <div className="split-tools">
        {downloaderVisible ? <YouTubeDownloader /> : null}
        <LocalFileConverter />
      </div>
    </article>
  );
}
