"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnalysisResult, HistoryEntry } from "@/types/analysis";
import { clampBpm } from "@/lib/format";
import { useHistory } from "@/hooks/useHistory";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { TopBar } from "./layout/TopBar";
import { Footer } from "./layout/Footer";
import { AnalyzerPanel } from "./analysis/AnalyzerPanel";
import { BpmToolsView } from "./bpm/BpmToolsView";
import { DelayCalculator } from "./delay/DelayCalculator";
import { PitchConverter } from "./pitch/PitchConverter";
import { ConverterView } from "./converter/ConverterView";
import { HistoryPanel } from "./history/HistoryPanel";
import { LoudnessPanel } from "./loudness/LoudnessPanel";
import { RemixStudio } from "./remix/RemixStudio";
import { CutterPanel } from "./cutter/CutterPanel";

export type ViewName = "analysis" | "bpm" | "delay" | "pitch" | "converter" | "loudness" | "remix" | "cutter" | "history";

const VIEW_NAMES: ViewName[] = ["analysis", "bpm", "delay", "pitch", "converter", "loudness", "remix", "cutter", "history"];

// Each tool has a real, clean URL (no #hash). Switching tabs updates the address
// bar to these paths via the History API — no page reload, so app state is kept —
// and each path is a real server route (see app/<path>/page.tsx) on refresh/share.
// Exported so NavTabs/Footer can render real <a href> links (crawlable).
export const VIEW_TO_PATH: Record<ViewName, string> = {
  analysis: "/key-bpm-finder",
  bpm: "/bpm-tap",
  delay: "/delay-reverb-calculator",
  pitch: "/pitch-shifter",
  converter: "/converter",
  loudness: "/loudness",
  remix: "/slowed-reverb",
  cutter: "/mp3-cutter",
  history: "/history",
};

function viewForPath(pathname: string): ViewName | null {
  const match = (Object.keys(VIEW_TO_PATH) as ViewName[]).find((v) => VIEW_TO_PATH[v] === pathname);
  return match ?? null;
}

interface TunebadContextValue {
  view: ViewName;
  showView(view: ViewName): void;
  delayBpm: string;
  setDelayBpmInput(value: string): void;
  setMainBpm(value: number): number;
  metronomeBpm: number;
  setMetronomeBpm(value: number): void;
  lastAnalyzedBpm: number | null;
  setLastAnalyzedBpm(value: number | null): void;
  lastAnalysis: AnalysisResult | null;
  setLastAnalysis(result: AnalysisResult | null): void;
  history: HistoryEntry[];
  rememberResult(result: AnalysisResult): void;
  clearHistory(): void;
  pendingFiles: File[] | null;
  requestAnalysis(files: File[], options?: { switchView?: boolean }): void;
  clearPendingFiles(): void;
}

const TunebadContext = createContext<TunebadContextValue | null>(null);

export function useTunebad(): TunebadContextValue {
  const value = useContext(TunebadContext);
  if (!value) throw new Error("useTunebad must be used inside <TunebadApp>");
  return value;
}

export function TunebadApp({
  initialView = "analysis",
  landingSlot,
}: { initialView?: ViewName; landingSlot?: ReactNode } = {}) {
  const [view, setView] = useState<ViewName>(initialView);
  const [delayBpm, setDelayBpm] = useState("124.00");
  const [metronomeBpm, setMetronomeBpmState] = useState(124);
  const [lastAnalyzedBpm, setLastAnalyzedBpm] = useState<number | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisResult | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const { items: history, rememberResult, clearHistory } = useHistory();

  useEffect(() => {
    // Sync the view from the real path first (e.g. /converter), then fall back to
    // legacy #hash links so old bookmarks still work.
    const byPath = viewForPath(window.location.pathname);
    if (byPath) {
      setView(byPath);
      return;
    }
    const initial = window.location.hash.replace("#", "");
    if (VIEW_NAMES.includes(initial as ViewName)) setView(initial as ViewName);
  }, []);


  const showView = useCallback((next: ViewName) => {
    setView(next);
    window.history.replaceState(null, "", VIEW_TO_PATH[next]);
    // Jump, don't glide: a smooth scroll animates for ~400ms on every tab
    // switch, which reads as the whole switch being slow.
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const setDelayBpmInput = useCallback((value: string) => {
    setDelayBpm(value);
    setMetronomeBpmState(Math.round(clampBpm(value)));
  }, []);

  const setMainBpm = useCallback((value: number) => {
    const bpm = clampBpm(value);
    setDelayBpm(bpm.toFixed(2));
    setMetronomeBpmState(Math.round(bpm));
    return bpm;
  }, []);

  const setMetronomeBpm = useCallback((value: number) => {
    setMetronomeBpmState(Math.round(clampBpm(value)));
  }, []);

  const requestAnalysis = useCallback(
    (files: File[], options?: { switchView?: boolean }) => {
      setPendingFiles(files);
      if (options?.switchView !== false) showView("analysis");
    },
    [showView],
  );

  const clearPendingFiles = useCallback(() => setPendingFiles(null), []);

  const contextValue = useMemo<TunebadContextValue>(
    () => ({
      view,
      showView,
      delayBpm,
      setDelayBpmInput,
      setMainBpm,
      metronomeBpm,
      setMetronomeBpm,
      lastAnalyzedBpm,
      setLastAnalyzedBpm,
      lastAnalysis,
      setLastAnalysis,
      history,
      rememberResult,
      clearHistory,
      pendingFiles,
      requestAnalysis,
      clearPendingFiles,
    }),
    [
      view,
      showView,
      delayBpm,
      setDelayBpmInput,
      setMainBpm,
      metronomeBpm,
      setMetronomeBpm,
      lastAnalyzedBpm,
      lastAnalysis,
      history,
      rememberResult,
      clearHistory,
      pendingFiles,
      requestAnalysis,
      clearPendingFiles,
    ],
  );

  return (
    <TunebadContext.Provider value={contextValue}>
      <I18nProvider>
        <div className="app-shell">
          <div className="grain-overlay" aria-hidden="true" />
          <GlobalDropCatcher view={view} />
          <TopBar />
          <main>
            <section
              className={`page-view${view === "analysis" ? " active" : ""}`}
              data-view="analysis"
              data-active={view === "analysis"}
            >
              <AnalyzerPanel />
            </section>
            <section
              className={`page-view${view === "bpm" ? " active" : ""}`}
              data-view="bpm"
              data-active={view === "bpm"}
            >
              <BpmToolsView />
            </section>
            <section
              className={`page-view${view === "delay" ? " active" : ""}`}
              data-view="delay"
              data-active={view === "delay"}
            >
              <DelayCalculator />
            </section>
            <section
              className={`page-view${view === "pitch" ? " active" : ""}`}
              data-view="pitch"
              data-active={view === "pitch"}
            >
              <PitchConverter />
            </section>
            <section
              className={`page-view${view === "converter" ? " active" : ""}`}
              data-view="converter"
              data-active={view === "converter"}
            >
              <ConverterView />
            </section>
            <section
              className={`page-view${view === "loudness" ? " active" : ""}`}
              data-view="loudness"
              data-active={view === "loudness"}
            >
              <LoudnessPanel />
            </section>
            <section
              className={`page-view${view === "remix" ? " active" : ""}`}
              data-view="remix"
              data-active={view === "remix"}
            >
              <RemixStudio />
            </section>
            <section
              className={`page-view${view === "cutter" ? " active" : ""}`}
              data-view="cutter"
              data-active={view === "cutter"}
            >
              <CutterPanel />
            </section>
            <section
              className={`page-view${view === "history" ? " active" : ""}`}
              data-view="history"
              data-active={view === "history"}
            >
              <HistoryPanel />
            </section>
          </main>
          {/* Homepage-only About/FAQ section. Hidden client-side once the user
              switches to another tool so it doesn't trail unrelated views; the
              SSR HTML (what crawlers see) always contains it since view starts
              at initialView. */}
          {view === initialView && landingSlot}
          <Footer />
        </div>
      </I18nProvider>
    </TunebadContext.Provider>
  );
}

// Views that already have their own file intake keep native drop behavior;
// on the rest (metronome, delay, pitch, history), dropping an audio file
// anywhere routes it straight to the analyzer.
const VIEWS_WITH_OWN_INTAKE = new Set<ViewName>(["analysis", "converter", "loudness", "remix", "cutter"]);

function GlobalDropCatcher({ view }: { view: ViewName }) {
  const { requestAnalysis } = useTunebad();
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const active = !VIEWS_WITH_OWN_INTAKE.has(view);

  useEffect(() => {
    if (!active) {
      setDragging(false);
      return;
    }
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []).filter(
        (f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name),
      );
      if (files.length) requestAnalysis(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [active, requestAnalysis]);

  if (!active || !dragging) return null;
  return (
    <div className="global-drop-overlay" aria-hidden="true">
      <span>{t("app.dropAnywhere")}</span>
    </div>
  );
}
