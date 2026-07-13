// Copies the single-threaded ffmpeg.wasm core (GPL, unmodified official build:
// https://github.com/ffmpegwasm/ffmpeg.wasm) into /public so the client can
// load it same-origin — the CSP's connect-src blocks CDN fetches. Re-run after
// bumping @ffmpeg/core.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/vendor/ffmpeg", { recursive: true });
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(`node_modules/@ffmpeg/core/dist/umd/${f}`, `public/vendor/ffmpeg/${f}`);
  console.log("vendored", f);
}

// LAME MP3 encoder compiled to WebAssembly (wasm-media-encoders) — same
// same-origin requirement. Re-run after bumping wasm-media-encoders.
mkdirSync("public/vendor/mp3", { recursive: true });
copyFileSync("node_modules/wasm-media-encoders/wasm/mp3.wasm", "public/vendor/mp3/mp3.wasm");
console.log("vendored mp3.wasm");
