"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTunebad } from "../TunebadApp";
import { useAnalyzer } from "@/hooks/useAnalyzer";
import { exportResultsCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { DropZone } from "./DropZone";
import { LinkAnalyze, type LinkPreviewMeta } from "./LinkAnalyze";
import { WaveformPreview } from "./WaveformPreview";
import { FileMetaPill } from "./FileMetaPill";
import { AnalysisSummary } from "./AnalysisSummary";
import { ResultsTable } from "./ResultsTable";
import type { AnalysisResult } from "@/types/analysis";
import { WaveformIcon } from "@/components/ui/icons";

export function AnalyzerPanel() {
  const { showView, setMainBpm, setLastAnalyzedBpm, setLastAnalysis, rememberResult, pendingFiles, clearPendingFiles } =
    useTunebad();
  const { t } = useI18n();

  // Set while a link-analysis preview file is in flight, so the matching
  // result can be written back to the shared community cache.
  const pendingLinkMeta = useRef<LinkPreviewMeta | null>(null);

  const onResult = useCallback(
    (result: AnalysisResult) => {
      setLastAnalyzedBpm(result.bpm);
      if (result.bpm) setMainBpm(result.bpm);
      setLastAnalysis(result);
      rememberResult(result);

      const meta = pendingLinkMeta.current;
      if (meta && meta.fileName === result.name) {
        pendingLinkMeta.current = null;
        // Only strong essentia results are worth sharing; fire-and-forget.
        if (result.engine === "essentia" && result.bpm) {
          // Normalize display-oriented values to the cache's canonical forms:
          // camelot arrives as "Camelot 4B", energy/danceability on a 0-100 scale.
          const camelotCode = (result.camelot || "").match(/(1[0-2]|[1-9])[AB]/)?.[0] ?? null;
          const unit = (v: number | null | undefined) =>
            v == null ? null : Math.min(1, Math.max(0, v > 1 ? v / 100 : v));
          void fetch("/api/cache-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: meta.id,
              title: meta.title,
              artist: meta.artist ?? null,
              bpm: result.bpm,
              bpm_alt: result.bpmAlternate ?? null,
              // result.key is already the full "G# Major" form; only append
              // the scale if a bare tonic ever comes through.
              key: result.key.includes(result.scale) ? result.key : `${result.key} ${result.scale}`,
              camelot: camelotCode,
              energy: unit(result.energy),
              danceability: unit(result.danceability),
              loudness_db: result.loudness ?? null,
              duration_s: result.duration || null,
            }),
          }).catch(() => {});
        }
      }
    },
    [setLastAnalyzedBpm, setMainBpm, setLastAnalysis, rememberResult],
  );

  const {
    results,
    analyzingNames,
    failedNames,
    oversizedNames,
    current,
    waveformBars,
    previewUrl,
    previewDuration,
    analyzeFiles,
    clearResults,
  } = useAnalyzer(onResult);

  // Files handed off from the converter ("Analyze this track")
  useEffect(() => {
    if (!pendingFiles?.length) return;
    void analyzeFiles(pendingFiles);
    clearPendingFiles();
  }, [pendingFiles, clearPendingFiles, analyzeFiles]);

  return (
    <article className="panel hero-tool analyzer-panel" id="file-analyzer">
      <div className="panel-heading hero-heading">
        <div>
          <h1>
            <WaveformIcon className="panel-title-icon" />
            {t("analysis.title")}
          </h1>
          <p>{t("analysis.subtitle")}</p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" type="button" onClick={() => showView("history")}>
            {t("analysis.history")}
          </button>
          <button className="text-button danger-pill" type="button" onClick={clearResults}>
            {t("analysis.clear")}
          </button>
        </div>
      </div>

      <LinkAnalyze
        onPreviewFile={(file, meta) => {
          pendingLinkMeta.current = meta;
          void analyzeFiles([file]);
        }}
      />

      <DropZone onFiles={(files) => void analyzeFiles(files)} />

      {current !== null ? (
        <>
          <WaveformPreview bars={waveformBars} previewUrl={previewUrl} duration={previewDuration} />
          <FileMetaPill result={current} onRemove={clearResults} />
          <AnalysisSummary result={current} />
        </>
      ) : null}

      <div className="results-heading">
        <h2>{t("analysis.resultsHeading")}</h2>
        <div className="inline-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => {
              if (results.length) exportResultsCsv(results);
            }}
          >
            {t("analysis.exportCsv")}
          </button>
          <button className="text-button" type="button" onClick={clearResults}>
            {t("analysis.clearResults")}
          </button>
        </div>
      </div>

      <ResultsTable
        results={results}
        analyzingNames={analyzingNames}
        failedNames={failedNames}
        oversizedNames={oversizedNames}
      />
    </article>
  );
}
