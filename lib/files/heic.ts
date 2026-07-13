// Client-side HEIC/HEIF decoder for the heic-to-jpg tool, built on `heic-to`
// (LGPL-3.0, https://github.com/hoppergee/heic-to). Despite the "wasm" framing
// in most HEIC-decoder packages, heic-to's default build compiles libheif to
// asm.js (pure JavaScript, no separate .wasm binary) — the whole ~2.9MB
// decoder is one self-contained module. It decodes inside a Web Worker it
// spawns itself from a blob: URL (allowed by the CSP's `worker-src 'self'
// blob:`) and needs 'unsafe-eval' for the asm.js path, which the CSP already
// grants for essentia.js. No CDN fetch, nothing to vendor into /public.
//
// Only ever import this module via a dynamic `import()` from the
// /heic-to-jpg route — a static top-level import would pull the ~2.9MB chunk
// into every page that imports lib/files/heic.ts.
import { drawResized, encodeCanvas, sourceSize, type ImageOutputFormat } from "./image";

export const HEIC_MAX_BYTES = 80 * 1024 * 1024; // mirrors IMAGE_MAX_BYTES
export const HEIC_MAX_FILES = 20; // mirrors IMAGE_MAX_FILES

export class HeicTooLargeError extends Error {}
export class HeicDecodeError extends Error {}

export type HeicOutputFormat = Extract<ImageOutputFormat, "jpeg" | "png">;

let heicToPromise: Promise<typeof import("heic-to")> | null = null;
function loadHeicTo(): Promise<typeof import("heic-to")> {
  if (!heicToPromise) {
    heicToPromise = import("heic-to").catch((error) => {
      // Failed loads must not poison the cache; allow a retry.
      heicToPromise = null;
      throw error;
    });
  }
  return heicToPromise;
}

/**
 * Sniff the ISO-BMFF brand box heic-to itself checks — the file's MIME is
 * unreliable (browsers frequently report "" for .heic/.heif), so callers
 * should gate on this (or the file extension) rather than `file.type`.
 */
export async function looksLikeHeic(file: File): Promise<boolean> {
  try {
    const { isHeic } = await loadHeicTo();
    return await isHeic(file);
  } catch {
    return /\.hei[cf]$/i.test(file.name);
  }
}

export type HeicResult = { blob: Blob; width: number; height: number };

/**
 * Decode a HEIC/HEIF file and re-encode it through the shared canvas pipeline
 * in lib/files/image.ts, so JPEG quality handling matches every other image
 * tool on the site. HEIC containers with multiple images (bursts, live
 * photos) decode only the primary image — heic-to's worker always reads
 * libheif's first frame.
 */
export async function convertHeic(
  file: File,
  format: HeicOutputFormat,
  quality: number,
): Promise<HeicResult> {
  if (file.size > HEIC_MAX_BYTES) throw new HeicTooLargeError();
  const { heicTo } = await loadHeicTo();

  let bitmap: ImageBitmap;
  try {
    bitmap = await heicTo({ blob: file, type: "bitmap" });
  } catch {
    throw new HeicDecodeError();
  }
  try {
    const { width, height } = sourceSize(bitmap);
    const canvas = drawResized(bitmap, width, height, "cover", format);
    const blob = await encodeCanvas(canvas, format, format === "png" ? undefined : quality);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

export function heicOutputName(name: string, format: HeicOutputFormat): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}.${format === "png" ? "png" : "jpg"}`;
}
