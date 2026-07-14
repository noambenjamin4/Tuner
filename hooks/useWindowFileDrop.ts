"use client";

import { useEffect, useRef } from "react";

// Page-level drag/drop guard, and optionally a "replace the current file" intake.
//
// Every tool REMOVES its drop zone once a track is loaded, so after that point a
// stray drop anywhere on the page hits the browser default: it navigates to the
// dropped file and the whole session (trim points, remix settings, the master)
// is gone. This hook stops that unconditionally by preventing the default on
// dragover/drop at the window, which is the minimum bar on every page. It is
// safe to mount several of these on one page — the guard is idempotent and only
// the instance with `active` set ever loads a file.
//
// When `onFiles` is given and `active` is true, a dropped audio file is also
// handed to the tool as a replacement. Gate `active` on the tool's own drop zone
// being GONE (i.e. a file is loaded): while that zone is mounted it handles its
// own drops via useFileDrop, and leaving `active` false here is what keeps a
// file from being loaded twice.
export function useWindowFileDrop({
  active = false,
  onFiles,
}: {
  active?: boolean;
  onFiles?: (files: File[]) => void;
} = {}) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onOver = (event: DragEvent) => {
      // Without this the drop event never fires and the browser navigates.
      if (hasFiles(event)) event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Unconditional: this is the navigation guard, and it must hold whether or
      // not this instance is the one that loads the file.
      event.preventDefault();
      if (!activeRef.current) return;
      const handler = onFilesRef.current;
      if (!handler) return;
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        (file) => file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name),
      );
      if (files.length) handler(files);
    };

    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
