"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTuner } from "../TunerApp";
import { useYouTubeJob } from "@/hooks/useYouTubeJob";
import { validateMediaUrl, validateSpotifyUrl } from "@/lib/media-url";
import { delayDivisions } from "@/lib/audio/delay";
import { useI18n } from "@/lib/i18n";
import { CheckRow } from "@/components/ui/CheckRow";
import { SetupNotice } from "./SetupNotice";
import { PlaylistBatch } from "./PlaylistBatch";
import type { PlaylistItem } from "@/hooks/usePlaylistBatch";
import {
  QualityPicker,
  ResolutionPicker,
  FormatPicker,
  VIDEO_FORMAT_OPTION,
  type Quality,
  type Resolution,
  type OutputFormat,
} from "./QualityPicker";

const LINK_FORMATS = [
  { value: "mp3" as const, label: "MP3", hintKey: "converter.formatHintSmallFile" as const },
  { value: "wav" as const, label: "WAV", hintKey: "converter.formatHintSampleExact" as const },
  VIDEO_FORMAT_OPTION,
];

const DEFAULT_AUDIO_QUALITY: Quality = "320";
const DEFAULT_VIDEO_RESOLUTION: Resolution = "1080";

export function YouTubeDownloader() {
  const { requestAnalysis, lastAnalysis, showView } = useTuner();
  const { state, start, reset } = useYouTubeJob();
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  // A single `quality` field is shared by both pickers — kbps values while
  // format is mp3/wav, resolution values while format is mp4 — so it's always
  // valid for whatever format is currently selected (see onFormatChange).
  const [quality, setQuality] = useState<string>(DEFAULT_AUDIO_QUALITY);
  const [format, setFormat] = useState<OutputFormat>("mp3");
  const [trimSilence, setTrimSilence] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [inputError, setInputError] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const [autoAnalyzedName, setAutoAnalyzedName] = useState<string | null>(null);
  const autoAnalyzedJobRef = useRef<string | null>(null);

  // Playlist mode: a URL containing list= offers a "convert whole playlist"
  // affordance instead of forcing the single-video flow. A plain watch?v=
  // (even with list= present) still defaults to single unless the user
  // explicitly opts into batch mode via that affordance — keeps the common
  // case (pasting a video link from within a playlist) predictable.
  const [playlistMode, setPlaylistMode] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[] | null>(null);
  const [playlistBatchConfig, setPlaylistBatchConfig] = useState<{ format: OutputFormat; quality: string } | null>(null);

  const busy = state.phase === "starting" || state.phase === "working";
  const isVideo = format === "mp4";
  const hasPlaylistParam = /[?&]list=/.test(url);
  const spotify = validateSpotifyUrl(url);
  const isSpotify = Boolean(spotify);
  // Spotify batches are audio-only — if the shared `quality` state currently
  // holds a video resolution (mp4 was selected before pasting a Spotify
  // link), fall back to the default audio bitrate for the picker + submit.
  const spotifyQuality: Quality =
    quality === "320" || quality === "256" || quality === "192" || quality === "128"
      ? (quality as Quality)
      : DEFAULT_AUDIO_QUALITY;

  useEffect(() => {
    // Any URL edit invalidates a previously enumerated playlist / toggle.
    setPlaylistMode(false);
    setPlaylistItems(null);
    setPlaylistBatchConfig(null);
    setPlaylistError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const onFormatChange = (nextFormat: OutputFormat) => {
    setFormat(nextFormat);
    if (nextFormat === "mp4") {
      setQuality(DEFAULT_VIDEO_RESOLUTION);
    } else {
      setQuality(DEFAULT_AUDIO_QUALITY);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (isSpotify) {
      setInputError(null);
      setPlaylistError(null);
      setPlaylistItems(null);
      setPlaylistLoading(true);
      // Spotify tracks are audio only (matched + downloaded from YouTube) —
      // if mp4 happens to be selected, fall back to mp3 for this batch.
      const batchFormat: OutputFormat = format === "mp4" ? "mp3" : format;
      void (async () => {
        try {
          const response = await fetch("/api/spotify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !Array.isArray(payload.items)) {
            setPlaylistError(payload.error || t("ytDownloader.couldNotStart"));
            return;
          }
          const spotifyItems: PlaylistItem[] = payload.items.map(
            (item: { title: string; artist: string }, index: number) => ({
              kind: "spotify" as const,
              id: `spotify-${index}`,
              title: item.title,
              artist: item.artist,
            }),
          );
          setPlaylistItems(spotifyItems);
          setPlaylistBatchConfig({ format: batchFormat, quality: spotifyQuality });
        } catch {
          setPlaylistError(t("ytDownloader.couldNotReachServer"));
        } finally {
          setPlaylistLoading(false);
        }
      })();
      return;
    }

    if (playlistMode) {
      setInputError(null);
      setPlaylistError(null);
      setPlaylistItems(null);
      setPlaylistLoading(true);
      void (async () => {
        try {
          const response = await fetch("/api/youtube/playlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !Array.isArray(payload.items)) {
            setPlaylistError(payload.error || t("ytDownloader.couldNotStart"));
            return;
          }
          const youtubeItems: PlaylistItem[] = payload.items.map((item: { id: string; title: string | null }) => ({
            kind: "youtube" as const,
            id: item.id,
            title: item.title,
          }));
          setPlaylistItems(youtubeItems);
          setPlaylistBatchConfig({ format, quality });
        } catch {
          setPlaylistError(t("ytDownloader.couldNotReachServer"));
        } finally {
          setPlaylistLoading(false);
        }
      })();
      return;
    }

    const validated = validateMediaUrl(url);
    if (!validated) {
      setInputError(t("ytDownloader.linkError"));
      return;
    }
    setInputError(null);
    autoAnalyzedJobRef.current = null;
    setAutoAnalyzedName(null);
    void start(validated.url, quality, format, trimSilence);
  };

  const analyzeDownloaded = async (jobId: string, title: string | null) => {
    setHandingOff(true);
    try {
      const response = await fetch(`/api/youtube/${jobId}/file`);
      if (!response.ok) throw new Error(t("ytDownloader.couldNotFetchAudio"));
      const blob = await response.blob();
      const type = blob.type || (format === "wav" ? "audio/wav" : "audio/mpeg");
      const ext = type === "audio/wav" ? "wav" : "mp3";
      const name = `${title || "tuner-download"}.${ext}`;
      const file = new File([blob], name, { type });
      requestAnalysis([file], { switchView: false });
      return name;
    } catch (error) {
      console.error(error);
      return null;
    } finally {
      setHandingOff(false);
    }
  };

  const manualAnalyze = async (jobId: string, title: string | null) => {
    setHandingOff(true);
    try {
      const response = await fetch(`/api/youtube/${jobId}/file`);
      if (!response.ok) throw new Error(t("ytDownloader.couldNotFetchAudio"));
      const blob = await response.blob();
      const type = blob.type || (format === "wav" ? "audio/wav" : "audio/mpeg");
      const ext = type === "audio/wav" ? "wav" : "mp3";
      const file = new File([blob], `${title || "tuner-download"}.${ext}`, { type });
      requestAnalysis([file]);
    } catch (error) {
      console.error(error);
    } finally {
      setHandingOff(false);
    }
  };

  useEffect(() => {
    if (state.phase !== "done") return;
    if (isVideo) return;
    if (!autoAnalyze) return;
    if (autoAnalyzedJobRef.current === state.jobId) return;
    autoAnalyzedJobRef.current = state.jobId;
    void analyzeDownloaded(state.jobId, state.title).then((name) => {
      if (name) setAutoAnalyzedName(name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, autoAnalyze]);

  const analysisReady = Boolean(autoAnalyzedName) && lastAnalysis?.name === autoAnalyzedName;
  const analysisPending = Boolean(autoAnalyzedName) && !analysisReady;

  // Wakes a sleeping Render free-tier remote downloader as soon as this card
  // is visible, so it's warm by the time the user submits a link. No-op if
  // no remote downloader is configured (the route returns 204 either way).
  useEffect(() => {
    void fetch("/api/youtube/wake").catch(() => {});
  }, []);

  return (
    <article className="utility-card converter-card">
      <div className="tool-heading">
        <div>
          <h3>{t("ytDownloader.title")}</h3>
          <p>{t("ytDownloader.subtitle")}</p>
        </div>
      </div>

      <form className="converter-form" onSubmit={onSubmit}>
        <label>
          {t("ytDownloader.trackUrl")}
          <input
            type="url"
            placeholder={t("ytDownloader.urlPlaceholder")}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setInputError(null);
            }}
            disabled={busy}
          />
        </label>
        {hasPlaylistParam && !isSpotify ? (
          <CheckRow checked={playlistMode} onChange={setPlaylistMode} disabled={busy || playlistLoading}>
            {t("ytDownloader.playlistConvertAll")}
          </CheckRow>
        ) : null}
        {isSpotify ? null : <FormatPicker value={format} onChange={onFormatChange} formats={LINK_FORMATS} />}
        {isSpotify ? (
          <QualityPicker value={spotifyQuality} onChange={setQuality} />
        ) : isVideo ? (
          <ResolutionPicker value={quality as Resolution} onChange={setQuality} />
        ) : format === "mp3" ? (
          <QualityPicker value={quality as Quality} onChange={setQuality} />
        ) : null}
        {isSpotify ? null : isVideo || playlistMode ? null : (
          <>
            <CheckRow checked={trimSilence} onChange={setTrimSilence} disabled={busy}>
              {t("converter.autoTrim")}
            </CheckRow>
            <CheckRow checked={autoAnalyze} onChange={setAutoAnalyze} disabled={busy}>
              {t("ytDownloader.autoAnalyze")}
            </CheckRow>
          </>
        )}
        <button className="convert-button" type="submit" disabled={busy || playlistLoading || !url.trim()}>
          {playlistLoading
            ? t("ytDownloader.loading")
            : busy
              ? t("ytDownloader.loading")
              : isSpotify
                ? t("ytDownloader.spotifyConvert")
                : playlistMode
                  ? t("ytDownloader.playlistConvertAll")
                  : t("converter.convertTo", { format: format.toUpperCase() })}
        </button>
      </form>

      {inputError ? (
        <div className="status-box" data-tone="warning" role="status">
          <strong>{t("ytDownloader.linkErrorTitle")}</strong>
          <span>{inputError}</span>
        </div>
      ) : playlistError ? (
        <div className="status-box" data-tone="warning" role="status">
          <strong>{t("ytDownloader.linkErrorTitle")}</strong>
          <span>{playlistError}</span>
        </div>
      ) : playlistLoading ? (
        <div className="status-box" role="status">
          <strong>{isSpotify ? t("ytDownloader.spotifyDetected") : t("ytDownloader.playlistDetected")}</strong>
          <span>{t("ytDownloader.startingMessage")}</span>
        </div>
      ) : playlistItems && playlistBatchConfig ? (
        <div className="status-box" role="status">
          <strong>{isSpotify ? t("ytDownloader.spotifyDetected") : t("ytDownloader.playlistDetected")}</strong>
          <span>{t("ytDownloader.playlistTracks", { count: playlistItems.length })}</span>
          <PlaylistBatch items={playlistItems} format={playlistBatchConfig.format} quality={playlistBatchConfig.quality} />
        </div>
      ) : isSpotify ? (
        <div className="status-box" role="status">
          <strong>{t("ytDownloader.spotifyDetected")}</strong>
          <span>{t("ytDownloader.spotifyNote")}</span>
        </div>
      ) : state.phase === "idle" ? (
        <div className="status-box" role="status">
          <strong>{t("ytDownloader.idleTitle")}</strong>
          <span>{isVideo ? t("ytDownloader.videoNote") : t("ytDownloader.idleMessage")}</span>
        </div>
      ) : state.phase === "starting" ? (
        <div className="status-box" role="status">
          <strong>{t("ytDownloader.startingTitle")}</strong>
          <span>{t("ytDownloader.startingMessage")}</span>
        </div>
      ) : state.phase === "working" ? (
        <div className="status-box" role="status">
          <strong>{state.status === "converting" ? t("ytDownloader.converting") : t("ytDownloader.downloading")}</strong>
          <span>
            {state.title || t("ytDownloader.fetchingAudio")} — {Math.round(state.progress)}%
            <span className="progress-track" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${Math.max(2, state.progress)}%` }}></span>
            </span>
          </span>
        </div>
      ) : state.phase === "done" ? (
        <div className="status-box" data-tone="success" role="status">
          <strong>{t("ytDownloader.readyTitle")}</strong>
          <span>
            {t("ytDownloader.readyMessage", { title: state.title || t("ytDownloader.defaultTitle") })}
            <span className="inline-actions">
              <a className="download-ready-link" href={`/api/youtube/${state.jobId}/file`}>
                {t("ytDownloader.downloadFormat", { format: format.toUpperCase() })}
              </a>
              {isVideo ? null : (
                <button
                  className="text-button"
                  type="button"
                  disabled={handingOff}
                  onClick={() => void manualAnalyze(state.jobId, state.title)}
                >
                  {handingOff ? t("ytDownloader.analyzing") : t("ytDownloader.analyzeTrack")}
                </button>
              )}
              <button className="text-button" type="button" onClick={reset}>
                {t("ytDownloader.newDownload")}
              </button>
            </span>
          </span>
          {isVideo ? null : analysisPending ? <span className="autoflow-chip">{t("ytDownloader.analyzing")}</span> : null}
          {!isVideo && analysisReady && lastAnalysis ? (
            <span className="autoflow-chip">
              <span>
                <strong>{Math.round(lastAnalysis.bpm)} BPM</strong> · <strong>{lastAnalysis.key}</strong> ·{" "}
                <strong>{lastAnalysis.camelot}</strong>
              </span>
              {(() => {
                const { divisions, reverbPresets } = delayDivisions(lastAnalysis.bpm);
                const quarter = divisions.find((d) => d.label === "1/4");
                const eighth = divisions.find((d) => d.label === "1/8");
                const smallRoom = reverbPresets.find((p) => p.name === "Small Room");
                return (
                  <span>
                    {quarter ? t("ytDownloader.quarterDelay", { ms: quarter.normal.ms }) : ""}
                    {eighth ? t("ytDownloader.eighthDelay", { ms: eighth.normal.ms }) : ""}
                    {smallRoom
                      ? t("ytDownloader.smallRoomReverb", { pre: smallRoom.preDelayMs, decay: smallRoom.decayMs })
                      : ""}
                  </span>
                );
              })()}
              <span className="inline-actions">
                <button className="text-button" type="button" onClick={() => showView("delay")}>
                  {t("ytDownloader.openDelayTool")}
                </button>
                <button className="text-button" type="button" onClick={() => showView("analysis")}>
                  {t("ytDownloader.fullAnalysis")}
                </button>
              </span>
            </span>
          ) : null}
        </div>
      ) : state.phase === "setup" ? (
        <SetupNotice code={state.code} />
      ) : (
        <div className="status-box" data-tone="warning" role="status">
          <strong>{t("ytDownloader.downloadFailedTitle")}</strong>
          <span>{state.message}</span>
        </div>
      )}
    </article>
  );
}
