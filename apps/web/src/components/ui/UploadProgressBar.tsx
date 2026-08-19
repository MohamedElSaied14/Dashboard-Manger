"use client";

import { useCallback, useState } from "react";
import type { UploadProgress } from "../../utils/apiUpload";

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  uploading: "Uploading the file",
  processing: "The server is processing the file",
  downloading: "Receiving the result",
  done: "Done",
};

/**
 * Tracks one upload's percentage.
 *
 * `progress` is null whenever no upload is running, so a component can render the bar with
 * `{progress && <UploadProgressBar .../>}` and never has to reason about a stale percentage.
 */
export function useUploadProgress() {
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const onProgress = useCallback((next: UploadProgress) => setProgress(next), []);
  const reset = useCallback(() => setProgress(null), []);

  return { progress, onProgress, reset };
}

/** The percentage bar shown while a file is being uploaded and processed. */
export function UploadProgressBar({
  progress,
  label,
  hint,
}: {
  progress: UploadProgress | null;
  label?: string;
  hint?: string;
}) {
  if (!progress) return null;
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const bytes =
    progress.phase === "uploading" && progress.totalBytes > 0
      ? ` · ${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`
      : "";

  return (
    <div className="dr-progress-panel" style={{ marginTop: 10 }}>
      <div className="dr-progress-copy">
        <span className="dr-progress-status">
          {label ?? PHASE_LABEL[progress.phase]}
          {bytes}
        </span>
        <b>{percent}%</b>
      </div>
      <div
        className="dr-progress-track"
        role="progressbar"
        aria-label={label ?? PHASE_LABEL[progress.phase]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className="dr-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
