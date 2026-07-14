"use client";

import type { AnalysisResult } from "@/types/analysis";
import type { AnalyzeStage } from "@/hooks/useAnalyzer";
import { formatTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";

// Row text per phase. "analyzing" reuses the original string, so a caller that
// passes no stages still reads exactly as it did before.
const STAGE_ROW_LABELS: Record<AnalyzeStage, DictKey> = {
  decoding: "analysis.stageDecoding",
  resampling: "analysis.stageResampling",
  analyzing: "analysis.analyzing",
};

export function ResultsTable({
  results,
  analyzingNames,
  analyzingStages,
  failedNames,
  oversizedNames = [],
}: {
  results: AnalysisResult[];
  analyzingNames: string[];
  analyzingStages?: Record<string, AnalyzeStage>;
  failedNames: string[];
  oversizedNames?: string[];
}) {
  const { t } = useI18n();
  const empty = !results.length && !analyzingNames.length && !failedNames.length && !oversizedNames.length;
  return (
    <div className="table-wrap">
      {empty ? (
        <svg className="empty-vinyl-motif" viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="78" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="80" r="58" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="80" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="80" r="18" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="80" r="4" fill="currentColor" />
        </svg>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>{t("table.fileName")}</th>
            <th>{t("table.duration")}</th>
            <th>{t("table.bpm")}</th>
            <th>{t("table.key")}</th>
            <th>{t("table.camelot")}</th>
            <th>{t("table.confidence")}</th>
            <th>{t("table.analyzed")}</th>
          </tr>
        </thead>
        <tbody id="resultsBody">
          {empty ? (
            <tr className="empty-row">
              <td colSpan={7}>{t("analysis.noTracksYet")}</td>
            </tr>
          ) : (
            <>
              {analyzingNames.map((name) => (
                <tr key={`loading-${name}`}>
                  <td colSpan={7}>{t(STAGE_ROW_LABELS[analyzingStages?.[name] ?? "analyzing"], { name })}</td>
                </tr>
              ))}
              {failedNames.map((name) => (
                <tr key={`failed-${name}`}>
                  <td colSpan={7}>{t("analysis.analyzeFailed", { name })}</td>
                </tr>
              ))}
              {oversizedNames.map((name) => (
                <tr key={`oversized-${name}`}>
                  <td colSpan={7}>{t("analyzer.fileTooLarge", { name })}</td>
                </tr>
              ))}
              {results.map((result, index) => (
                <tr key={`${result.name}-${index}`}>
                  <td>{result.name}</td>
                  <td>{formatTime(result.duration)}</td>
                  <td className="accent">{result.bpm ? Math.round(result.bpm) : "N/A"}</td>
                  <td className="accent">{result.key}</td>
                  <td>{result.camelot || result.scale}</td>
                  <td>
                    <div className="confidence">
                      <span>{result.confidence}%</span>
                      <meter min={0} max={100} value={result.confidence}></meter>
                    </div>
                  </td>
                  <td>{result.analyzedAt}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
