# Graph Report - Tunebad  (2026-07-14)

## Corpus Check
- 229 files · ~239,893 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1364 nodes · 3228 edges · 72 communities (63 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3c3dd202`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- analysis.ts
- RemixStudio.tsx
- ytdlp.ts
- ffmpeg-core.js
- server.js
- TunebadApp
- en.ts
- TunebadApp.tsx
- dependencies
- lufs.ts
- VideoTool.tsx
- link-analysis.ts
- AnalyzerPanel.tsx
- ToolFaq.tsx
- CutterPanel.tsx
- ToolPageShell.tsx
- backends.ts
- media-url.ts
- compilerOptions
- seed-songs.mjs
- VideoTool.tsx
- fs
- LoudnessPanel.tsx
- VideoTool.tsx
- page.tsx
- icons.tsx
- getWasmTableEntry
- getSocketFromFD
- CutterPanel.tsx
- ExceptionInfo
- intArrayFromString
- ReverbEq.tsx
- AnalysisResult
- _strftime
- delay.ts
- asyncLoad
- abort
- audio-joiner.ts
- manifest.json
- page.tsx
- setup-ytdlp.mjs
- layout.tsx
- callRuntimeCallbacks
- tunebad-bridge.sh
- TuneBad — Security Review
- TuneBad
- LoudnessPanel.tsx
- getEnvStrings
- next.config.mjs
- gen-og-files.mjs
- TuneBad remote downloader
- essentia.d.ts
- next-env.d.ts
- downloadBlob
- tunebad-local.sh
- LandingSeo.tsx
- route.ts
- LoudnessPanel.tsx
- useHistory.ts
- rate-limit.ts
- MetronomeCard.tsx
- usePlaylistBatch.ts
- media-url.ts
- page.tsx
- spotify-playlist.ts
- route.ts
- youtube-playlist.ts
- delay.ts
- page.tsx
- NightcoreTool.tsx

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 117 edges
2. `downloadBlob()` - 29 edges
3. `RelatedTools()` - 27 edges
4. `ToolPageShell()` - 27 edges
5. `RemixStudio()` - 24 edges
6. `useTunebad()` - 22 edges
7. `formatBytes()` - 22 edges
8. `AudioMasteringTool()` - 20 edges
9. `DictKey` - 19 edges
10. `fs` - 19 edges

## Surprising Connections (you probably didn't know these)
- `generateStaticParams()` --calls--> `readAllSongs()`  [EXTRACTED]
  app/song/[slug]/page.tsx → lib/server/link-analysis.ts
- `generateStaticParams()` --calls--> `readAllSongs()`  [EXTRACTED]
  app/songs/bpm/[bpm]/page.tsx → lib/server/link-analysis.ts
- `LinkAnalyze()` --indirect_call--> `song()`  [INFERRED]
  components/analysis/LinkAnalyze.tsx → tests/artists.test.ts
- `AnalyzerState` --references--> `AnalysisResult`  [EXTRACTED]
  hooks/useAnalyzer.ts → types/analysis.ts
- `POST()` --calls--> `allowLookup()`  [EXTRACTED]
  app/api/cache-analysis/route.ts → lib/server/rate-limit.ts

## Import Cycles
- 3-file cycle: `components/TunebadApp.tsx -> components/layout/TopBar.tsx -> components/layout/NavTabs.tsx -> components/TunebadApp.tsx`
- 3-file cycle: `components/TunebadApp.tsx -> components/converter/ConverterView.tsx -> components/converter/YouTubeDownloader.tsx -> components/TunebadApp.tsx`
- 3-file cycle: `components/TunebadApp.tsx -> components/bpm/BpmToolsView.tsx -> components/bpm/MetronomeCard.tsx -> components/TunebadApp.tsx`
- 3-file cycle: `components/TunebadApp.tsx -> components/bpm/BpmToolsView.tsx -> components/bpm/TapTempoCard.tsx -> components/TunebadApp.tsx`

## Communities (72 total, 9 thin omitted)

### Community 0 - "analysis.ts"
Cohesion: 0.07
Nodes (54): EightDTool(), formatSemitones(), matchesPreset(), Preset, PRESETS, RemixStudio(), REVERB_TYPE_OPTIONS, Status (+46 more)

### Community 1 - "RemixStudio.tsx"
Cohesion: 0.15
Nodes (15): metadata, metadata, metadata, Status, VideoTool(), compressedName(), CompressProgress, compressToTargetSize() (+7 more)

### Community 2 - "ytdlp.ts"
Cohesion: 0.08
Nodes (36): CAMELOT_ORDER, ErrorKey, exportPlaylistCsv(), Phase, PlaylistAnalyzer(), AnalyzerState, useAnalyzer(), PlaylistCachedRow (+28 more)

### Community 3 - "ffmpeg-core.js"
Cohesion: 0.05
Nodes (20): alignMemory(), doCallback(), done(), _emscripten_asm_const_int(), _emscripten_get_heap_max(), emscripten_realloc_buffer(), _emscripten_resize_heap(), exec() (+12 more)

### Community 4 - "server.js"
Cohesion: 0.07
Nodes (43): AUDIOMACK_HOSTS, canonicalYouTubeUrl(), INSTAGRAM_HOSTS, MIXCLOUD_HOSTS, SOUNDCLOUD_HOSTS, TIKTOK_HOSTS, TWITTER_HOSTS, validateMediaUrl() (+35 more)

### Community 5 - "TunebadApp"
Cohesion: 0.06
Nodes (21): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+13 more)

### Community 6 - "en.ts"
Cohesion: 0.22
Nodes (8): baloo2, geistMono, geistSans, metadata, STRUCTURED_DATA, viewport, ClientErrorReporter(), report()

### Community 7 - "TunebadApp.tsx"
Cohesion: 0.14
Nodes (18): POST(), reportSchema, GET(), GET(), GET(), querySchema, isAllowedPreviewUrl(), readRecentAnalyses() (+10 more)

### Community 8 - "dependencies"
Cohesion: 0.05
Nodes (40): dependencies, essentia.js, fflate, @ffmpeg/core, @ffmpeg/ffmpeg, ffmpeg-static, heic-to, next (+32 more)

### Community 9 - "lufs.ts"
Cohesion: 0.21
Nodes (7): playlistRequestSchema, POST(), validatePlaylistUrl(), IMPORTANT: this module reads server-only secrets and must never be, fetchYouTubeTracklist(), YouTubeTracklistItem, YouTubeTracklistResult

### Community 10 - "VideoTool.tsx"
Cohesion: 0.16
Nodes (18): POST(), resultSchema, GET(), idSchema, querySchema, searchSchema, resolveTrack(), Home() (+10 more)

### Community 11 - "link-analysis.ts"
Cohesion: 0.11
Nodes (34): metadata, HeicTool(), ResultRow, Status, ImageDimensionError, ImageFormatPicker(), ImageTool(), ImageToolMode (+26 more)

### Community 12 - "AnalyzerPanel.tsx"
Cohesion: 0.19
Nodes (16): GET(), PlaylistLookupTrack, querySchema, runPool(), sleep(), SourceTrack, POST(), spotifyRequestSchema (+8 more)

### Community 13 - "ToolFaq.tsx"
Cohesion: 0.26
Nodes (14): globalStore, sweepJobs(), YT_BASE_DIR, YtJob, classifyError(), enumeratePlaylist(), isExecutable(), PlaylistItem (+6 more)

### Community 14 - "CutterPanel.tsx"
Cohesion: 0.27
Nodes (13): applyFades(), CutterPanel(), Status, clamp(), TrimWaveform(), bytesOf(), clearDecodeCache(), decodeAudioFileCached() (+5 more)

### Community 15 - "ToolPageShell.tsx"
Cohesion: 0.14
Nodes (7): metadata, metadata, metadata, metadata, metadata, FaqEntry, ToolFaq()

### Community 16 - "backends.ts"
Cohesion: 0.15
Nodes (28): ArchiveFormat, entryFileName(), Status, Tab, ZipTool(), buildHeader(), computeChecksum(), createTarGz() (+20 more)

### Community 17 - "media-url.ts"
Cohesion: 0.25
Nodes (8): POST(), pickBackend(), runningJobCount(), allowJobStart(), AUDIO_QUALITIES, startJobSchema, VIDEO_QUALITIES, SetupError

### Community 18 - "compilerOptions"
Cohesion: 0.10
Nodes (20): send_progress(), compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 19 - "seed-songs.mjs"
Cohesion: 0.13
Nodes (15): addTracks(), analyze(), CAMELOT, collectTracks(), COUNTRY_PLAYLISTS, __dirname, env, existing (+7 more)

### Community 20 - "VideoTool.tsx"
Cohesion: 0.16
Nodes (17): metadata, AUDIO_FORMATS, MediaConvertTool(), MP3_BITRATES, Status, VIDEO_FORMATS, AUDIO_MIME, audioArgs() (+9 more)

### Community 21 - "fs"
Cohesion: 0.11
Nodes (18): bigintToI53Checked(), doReadv(), doWritev(), _fd_close(), _fd_fdstat_get(), _fd_read(), _fd_seek(), _fd_write() (+10 more)

### Community 23 - "VideoTool.tsx"
Cohesion: 0.23
Nodes (19): CamelotWheel(), CODE_TO_KEY, point(), segmentPath(), SEGMENTS, shortKey(), generateMetadata(), generateStaticParams() (+11 more)

### Community 24 - "page.tsx"
Cohesion: 0.13
Nodes (9): CamelotWheelSvg(), metadata, polar(), WHEEL, metadata, metadata, metadata, metadata (+1 more)

### Community 25 - "icons.tsx"
Cohesion: 0.12
Nodes (17): metadata, metadata, FILE_TOOLS, ToolsHub(), CopyrightBody(), SECTIONS, LanguageMenu(), detectLocale() (+9 more)

### Community 26 - "getWasmTableEntry"
Cohesion: 0.12
Nodes (16): getWasmTableEntry(), invoke_i(), invoke_ii(), invoke_iii(), invoke_iiii(), invoke_iiiii(), invoke_iiiiii(), invoke_iiiiiiiii() (+8 more)

### Community 27 - "getSocketFromFD"
Cohesion: 0.17
Nodes (16): _getaddrinfo(), getSocketAddress(), getSocketFromFD(), inetPton4(), inetPton6(), jstoi_q(), ___syscall_accept4(), ___syscall_bind() (+8 more)

### Community 28 - "CutterPanel.tsx"
Cohesion: 0.15
Nodes (20): GET(), querySchema, Image(), loadFont(), size, displayTitle(), generateMetadata(), generateStaticParams() (+12 more)

### Community 30 - "intArrayFromString"
Cohesion: 0.18
Nodes (12): _getnameinfo(), inetNtop4(), inetNtop6(), intArrayFromString(), LazyUint8Array(), lengthBytesUTF8(), readSockaddr(), stringToNewUTF8() (+4 more)

### Community 31 - "ReverbEq.tsx"
Cohesion: 0.10
Nodes (37): DropZone(), RecentRow, RecentStrip(), ConverterView(), LocalFileConverter(), Status, PlaylistBatch(), FormatPicker() (+29 more)

### Community 32 - "AnalysisResult"
Cohesion: 0.36
Nodes (6): ALL_CODES, CamelotHubPage(), CODE_TO_KEY, generateMetadata(), parseCode(), readSongsByCamelotCode()

### Community 33 - "_strftime"
Cohesion: 0.15
Nodes (13): addDays(), arraySum(), ___assert_fail(), __gmtime_js(), isLeapYear(), __localtime_js(), __mktime_js(), readI53FromI64() (+5 more)

### Community 34 - "delay.ts"
Cohesion: 0.12
Nodes (19): AnalyzerPanel(), HistoryPanel(), Footer(), TOOL_LINKS, HISTORY_TAB, NavTabs(), TABS, TopBar() (+11 more)

### Community 35 - "asyncLoad"
Cohesion: 0.20
Nodes (12): addRunDependency(), assert(), asyncLoad(), createWasm(), FS_createPreloadedFile(), getUniqueRunDependency(), handleMessage(), instantiateAsync() (+4 more)

### Community 36 - "abort"
Cohesion: 0.20
Nodes (11): abort(), _dlopen(), ___dlsym(), getBinary(), getBinaryPromise(), getValue(), initRandomFill(), instantiateArrayBuffer() (+3 more)

### Community 37 - "audio-joiner.ts"
Cohesion: 0.22
Nodes (13): CONTENT_TYPE_BY_FORMAT, contentDisposition(), GET(), GET(), Backend, backendForJob(), BackendTag, homeBackend() (+5 more)

### Community 38 - "manifest.json"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, scope, short_name, start_url (+1 more)

### Community 39 - "page.tsx"
Cohesion: 0.16
Nodes (19): analyzeBandCurve(), applyStereoWidth(), BAND_EDGES, clampBand(), crestFactorDb(), effectiveCurve(), fft(), limitPeaks() (+11 more)

### Community 40 - "setup-ytdlp.mjs"
Cohesion: 0.22
Nodes (7): actual, binDir, check, expected, line, projectRoot, target

### Community 41 - "layout.tsx"
Cohesion: 0.21
Nodes (16): EXPORT_TARGETS, formatDb(), LoudnessPanel(), LoudnessWorkerResult, resampleTo48k(), toneFor(), PLATFORM_TARGETS, convertFileToMp3() (+8 more)

### Community 42 - "callRuntimeCallbacks"
Cohesion: 0.25
Nodes (8): addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun(), preRun(), run(), setTimeout()

### Community 43 - "tunebad-bridge.sh"
Cohesion: 0.29
Nodes (6): FFMPEG_PATH, HOST, publish_url(), tunebad-bridge.sh script, YTDLP_MAX_JOB_STARTS, YTDLP_PATH

### Community 44 - "TuneBad — Security Review"
Cohesion: 0.25
Nodes (7): Architecture: the link downloader, Attack surface by deployment, Bot / abuse exposure, Recommendations (defense-in-depth, not blockers), Summary, TuneBad — Security Review, Verified-safe findings

### Community 45 - "TuneBad"
Cohesion: 0.29
Nodes (6): Deployment, Features, Home Bridge (route downloads through your own Mac), Local development, Optional: cloud history (Supabase), TuneBad

### Community 46 - "LoudnessPanel.tsx"
Cohesion: 0.07
Nodes (30): ALL_CODES, CamelotWheelPage(), CODE_TO_KEY, FAQS, metadata, FAQS, metadata, PlaylistAnalyzerPage() (+22 more)

### Community 47 - "getEnvStrings"
Cohesion: 0.40
Nodes (5): _environ_get(), _environ_sizes_get(), getEnvStrings(), getExecutableName(), stringToAscii()

### Community 48 - "next.config.mjs"
Cohesion: 0.50
Nodes (3): csp, nextConfig, withBundleAnalyzer

### Community 53 - "downloadBlob"
Cohesion: 0.14
Nodes (21): CachedRow, isSupportedTrackUrl(), LinkAnalyze(), LinkPreviewMeta, looksLikeUrl(), permalinkFor(), Phase, AUDIOMACK_HOSTS (+13 more)

### Community 56 - "LandingSeo.tsx"
Cohesion: 0.16
Nodes (13): ActivityBpmPage(), generateMetadata(), metadata, SongBrowser(), SongRow, SortKey, SearchRow, SongSearch() (+5 more)

### Community 57 - "route.ts"
Cohesion: 0.39
Nodes (6): BpmHubPage(), generateMetadata(), generateStaticParams(), parseBpm(), tempoContext(), readSongsByBpmRange()

### Community 58 - "LoudnessPanel.tsx"
Cohesion: 0.21
Nodes (11): biquad(), blockPowers(), integratedLoudness(), kWeight(), loudnessFromPower(), PlatformTarget, samplePeakDb(), STAGE1 (+3 more)

### Community 59 - "useHistory.ts"
Cohesion: 0.14
Nodes (13): BpmToolsView(), PitchConverter(), REFERENCES, BASE_SVG_PROPS, DownloadIcon(), GaugeIcon(), HistoryIcon(), IconProps (+5 more)

### Community 60 - "rate-limit.ts"
Cohesion: 0.15
Nodes (17): AbMode, AudioMasteringTool(), barsFromChannels(), differenceCurve(), GENRE_LABELS, GENRE_ORDER, GENRE_PRESETS, GenreKey (+9 more)

### Community 61 - "MetronomeCard.tsx"
Cohesion: 0.09
Nodes (16): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+8 more)

### Community 62 - "usePlaylistBatch.ts"
Cohesion: 0.18
Nodes (16): AnalysisSummary(), MetricCardProps, FileMetaPill(), ResultsTable(), SimilarSong, SimilarSongs(), WaveformPreview(), clamp() (+8 more)

### Community 63 - "media-url.ts"
Cohesion: 0.13
Nodes (18): AudioEffectResult, Status, AudioFormatPicker(), AudioOutputFormat, MP3_BITRATES, AudioJoinerTool(), nextId(), QueuedFile (+10 more)

### Community 66 - "spotify-playlist.ts"
Cohesion: 0.43
Nodes (5): BassBoosterTool(), BassBoostParams, limitPeak(), renderBassBoost(), RenderedAudio

### Community 68 - "route.ts"
Cohesion: 0.16
Nodes (22): artistMetaTitle(), ArtistPage(), generateMetadata(), generateStaticParams(), GET(), GET(), STATIC_ENTRIES, ToolEntry (+14 more)

### Community 71 - "delay.ts"
Cohesion: 0.14
Nodes (18): MetronomeCard(), TapTempoCard(), DelayCalculator(), formatHz(), formatMs(), PRESET_NAME_KEYS, EchoIcon(), useTapTempo() (+10 more)

### Community 75 - "page.tsx"
Cohesion: 0.19
Nodes (18): AudioEffectTool(), PdfSplitTool(), Status, PdfTool(), PdfToolMode, Status, downloadBlob(), formatBytes() (+10 more)

### Community 77 - "NightcoreTool.tsx"
Cohesion: 0.31
Nodes (5): metadata, NightcoreTool(), NightcoreParams, RenderedAudio, renderNightcore()

## Knowledge Gaps
- **372 isolated node(s):** `metadata`, `resultSchema`, `reportSchema`, `querySchema`, `idSchema` (+367 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useI18n()` connect `ReverbEq.tsx` to `analysis.ts`, `RemixStudio.tsx`, `ytdlp.ts`, `link-analysis.ts`, `CutterPanel.tsx`, `ToolPageShell.tsx`, `backends.ts`, `VideoTool.tsx`, `icons.tsx`, `delay.ts`, `layout.tsx`, `LoudnessPanel.tsx`, `downloadBlob`, `useHistory.ts`, `rate-limit.ts`, `MetronomeCard.tsx`, `usePlaylistBatch.ts`, `media-url.ts`, `spotify-playlist.ts`, `delay.ts`, `page.tsx`, `NightcoreTool.tsx`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `keyToSlug()` connect `VideoTool.tsx` to `LandingSeo.tsx`, `route.ts`, `CutterPanel.tsx`, `LoudnessPanel.tsx`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `validateSpotifyUrl()` connect `downloadBlob` to `VideoTool.tsx`, `AnalyzerPanel.tsx`, `ReverbEq.tsx`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `metadata`, `resultSchema`, `reportSchema` to the rest of the system?**
  _374 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `analysis.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06557377049180328 - nodes in this community are weakly interconnected._
- **Should `RemixStudio.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14624505928853754 - nodes in this community are weakly interconnected._
- **Should `ytdlp.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08418367346938775 - nodes in this community are weakly interconnected._