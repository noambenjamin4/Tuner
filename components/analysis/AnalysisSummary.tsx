"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/types/analysis";
import { formatDetailedTime, formatSampleRate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

interface MetricCardProps {
  id: string;
  label: string;
  value: string;
  note: string;
  mono: boolean;
}

function MetricCard({ label, value, note, mono }: MetricCardProps) {
  return (
    <div className="metric-card">
      <small>{label}</small>
      <strong className={`analysis-value${mono ? "" : " analysis-value--text"}`}>{value}</strong>
      <em>{note}</em>
    </div>
  );
}

export function AnalysisSummary({ result }: { result: AnalysisResult }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  // One tap copies "150 BPM (or 75) · A Minor · 8A" for DAW notes/filenames.
  const copyResult = () => {
    const bpm = result.bpm ? `${Math.round(result.bpm)} BPM${result.bpmAlternate ? ` (or ${Math.round(result.bpmAlternate)})` : ""}` : "";
    const text = [bpm, result.key, result.camelot].filter(Boolean).join(" · ");
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const cards: MetricCardProps[] = [
    {
      id: "bpm",
      label: t("stat.bpm"),
      value: result.bpm ? String(Math.round(result.bpm)) : t("stat.naValue"),
      note:
        result.bpmAlternate !== null
          ? t("stat.noteOr", { value: Math.round(result.bpmAlternate) })
          : t("stat.noteDetected"),
      mono: true,
    },
    { id: "key", label: t("stat.key"), value: result.key, note: result.camelot, mono: false },
    {
      id: "duration",
      label: t("stat.duration"),
      value: formatDetailedTime(result.duration),
      note: t("stat.noteMmss"),
      mono: true,
    },
    {
      id: "sampleRate",
      label: t("stat.sampleRate"),
      value: formatSampleRate(result.sampleRate),
      note: t("stat.noteHighQuality"),
      mono: true,
    },
    { id: "bitDepth", label: t("stat.bitDepth"), value: result.bitDepthLabel, note: t("stat.notePcm"), mono: false },
    {
      id: "channels",
      label: t("stat.channels"),
      value: String(result.channels),
      note: result.channels === 1 ? t("common.mono") : t("common.stereo"),
      mono: true,
    },
    {
      id: "energy",
      label: t("stat.energy"),
      value: result.energy === null ? t("stat.dash") : `${result.energy}`,
      note: t("stat.noteRange"),
      mono: true,
    },
    {
      id: "danceability",
      label: t("stat.danceability"),
      value: result.danceability === null ? t("stat.dash") : `${result.danceability}`,
      note: t("stat.noteRange"),
      mono: true,
    },
    {
      id: "loudness",
      label: t("stat.loudness"),
      value: result.loudness === null ? t("stat.dash") : `${result.loudness.toFixed(1)} dB`,
      note: t("stat.noteRmsDbfs"),
      mono: true,
    },
  ];

  return (
    <div className="analysis-summary">
      <div className="summary-title">
        <h2>{t("analysis.resultsHeading")}</h2>
        {result.engine === "basic" ? <span className="engine-tag">{t("analysis.engineTagBasic")}</span> : null}
        <button className="text-button" type="button" onClick={copyResult}>
          {copied ? t("analysis.copied") : t("analysis.copyResult")}
        </button>
      </div>
      <div className="summary-grid">
        {cards.map((card) => (
          <MetricCard key={card.id} {...card} />
        ))}
      </div>
    </div>
  );
}
