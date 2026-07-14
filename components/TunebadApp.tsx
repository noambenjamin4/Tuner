"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  // Which tool the pending files are FOR. Every panel is mounted at once in
  // this SPA, so files must be addressed to one view or the analyzer would
  // swallow a handoff meant for the cutter.
  pendingTarget: ViewName | null;
  requestAnalysis(files: File[], options?: { switchView?: boolean }): void;
  sendFilesToTool(files: File[], target: ViewName, options?: { switchView?: boolean }): void;
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
  const [pendingTarget, setPendingTarget] = useState<ViewName | null>(null);
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
      setPendingTarget("analysis");
      if (options?.switchView !== false) showView("analysis");
    },
    [showView],
  );

  // Hand an already-loaded file straight to another tool and go there.
  // `switchView: false` is for handing a file to the tool the user is ALREADY
  // on (a stray drop replacing the current file) — switching would re-run
  // showView's scroll-to-top and yank the page away from what they were doing.
  const sendFilesToTool = useCallback(
    (files: File[], target: ViewName, options?: { switchView?: boolean }) => {
      setPendingFiles(files);
      setPendingTarget(target);
      if (options?.switchView !== false) showView(target);
    },
    [showView],
  );

  const clearPendingFiles = useCallback(() => {
    setPendingFiles(null);
    setPendingTarget(null);
  }, []);

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
      pendingTarget,
      requestAnalysis,
      sendFilesToTool,
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
      pendingTarget,
      requestAnalysis,
      sendFilesToTool,
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

// Views that already have their own file intake (a drop zone, at least until a
// file is loaded); on the rest (metronome, delay, pitch, history) there is no
// intake at all, so dropping an audio file anywhere routes it to the analyzer
// and the "drop anywhere" overlay invites exactly that.
const VIEWS_WITH_OWN_INTAKE = new Set<ViewName>(["analysis", "converter", "loudness", "remix", "cutter"]);

// Of those, the tools that actually consume the pendingFiles handoff (each has
// a pendingTarget effect). The converter is deliberately absent: its file picker
// never goes away, so it has no "drop zone is gone" hole to plug, and nothing
// there reads a handoff — routing to it would strand the file in pendingFiles.
// A stray drop on the converter is still guarded against navigating away.
const VIEWS_ACCEPTING_HANDOFF = new Set<ViewName>(["analysis", "loudness", "remix", "cutter"]);

// The SPA's single window-level drag/drop owner. Two jobs:
//
//  1. Navigation guard (ALWAYS on, every view). Each tool removes its drop zone
//     once a track is loaded, so from then on a stray drop would hit the browser
//     default, navigate to the file and destroy the session. Preventing the
//     default on dragover + drop is what stops that.
//  2. Routing. On a view with no intake of its own the file goes to the
//     analyzer (and the overlay advertises it). On a view that owns its intake
//     the file is handed to THAT tool via the existing pendingFiles handoff, so
//     it lands as "replace the current file" rather than doing nothing.
//
// This is the only window-level drop listener inside the SPA, so a drop that
// arrives here already `defaultPrevented` can only have been claimed by a tool's
// own visible drop zone (useFileDrop, target phase) — which is the signal used
// below to not load the same file twice.
function GlobalDropCatcher({ view }: { view: ViewName }) {
  const { requestAnalysis, sendFilesToTool } = useTunebad();
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const ownIntake = VIEWS_WITH_OWN_INTAKE.has(view);
  // Read through a ref so switching tabs never tears down the guard listeners.
  const viewRef = useRef(view);
  viewRef.current = view;

  // The overlay only ever belongs to the analyzer hand-off; drop it the moment
  // the user moves to a view that owns its intake, even mid-drag.
  useEffect(() => {
    if (ownIntake) setDragging(false);
  }, [ownIntake]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const routesToAnalyzer = () => !VIEWS_WITH_OWN_INTAKE.has(viewRef.current);
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || !routesToAnalyzer()) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e) || !routesToAnalyzer()) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      // Required on every view: without it the drop event never fires.
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      // Read before preventing — see the note above on defaultPrevented.
      const claimedByDropZone = e.defaultPrevented;
      e.preventDefault();
      if (claimedByDropZone) return;
      const files = Array.from(e.dataTransfer?.files ?? []).filter(
        (f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name),
      );
      if (!files.length) return;
      const current = viewRef.current;
      if (!VIEWS_WITH_OWN_INTAKE.has(current)) {
        requestAnalysis(files);
      } else if (VIEWS_ACCEPTING_HANDOFF.has(current)) {
        // Already on that tool, so don't switch: showView would scroll to top.
        sendFilesToTool(files, current, { switchView: false });
      }
      // Anything else (the converter) is guarded above and keeps its own intake.
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
  }, [requestAnalysis, sendFilesToTool]);

  if (ownIntake || !dragging) return null;
  return (
    <div className="global-drop-overlay" aria-hidden="true">
      <span>{t("app.dropAnywhere")}</span>
    </div>
  );
}
