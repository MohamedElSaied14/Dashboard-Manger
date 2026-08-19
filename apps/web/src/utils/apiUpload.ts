import { renewSession } from "./api";
import { useAuthStore } from "../store/authStore";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api";

export type UploadPhase = "uploading" | "processing" | "downloading" | "done";

export interface UploadProgress {
  /** 0-100, always defined so a bar can be rendered without branching. */
  percent: number;
  phase: UploadPhase;
  loadedBytes: number;
  totalBytes: number;
}

export interface UploadOptions {
  method?: "POST" | "PUT" | "PATCH";
  body: FormData;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Uploads with a real percentage.
 *
 * `fetch()` cannot report request-body progress, so every upload in the app used to show a bare
 * "Uploading..." label for as long as the file took. XMLHttpRequest still exposes
 * `upload.onprogress`, which is the only way to get a true byte-level percentage in the browser.
 *
 * The percentage is reported in three phases, because a Cloudinary/PDF upload spends real time
 * server-side after the bytes have arrived:
 *   0-90%   bytes leaving the browser (measured)
 *   90-99%  server processing (animated, no byte count exists for it)
 *   100%    response received
 */
export function apiUpload<T = any>(path: string, options: UploadOptions): Promise<T> {
  return runUpload<T>(path, options, true);
}

function runUpload<T>(path: string, options: UploadOptions, allowRefresh: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const token = useAuthStore.getState().accessToken;
    let processingTimer: ReturnType<typeof setInterval> | null = null;

    const report = (progress: UploadProgress) => options.onProgress?.(progress);
    const stopProcessingTicker = () => {
      if (processingTimer) {
        clearInterval(processingTimer);
        processingTimer = null;
      }
    };

    request.open(options.method ?? "POST", `${API_BASE_URL}${path}`, true);
    request.withCredentials = true;
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    // Content-Type is deliberately not set: the browser must add the multipart boundary itself.

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      report({
        percent: Math.round((event.loaded / event.total) * 90),
        phase: "uploading",
        loadedBytes: event.loaded,
        totalBytes: event.total,
      });
    };

    request.upload.onload = () => {
      // The bytes are in; the server is now doing the slow part (Cloudinary, PDF parsing, AI).
      // Creep towards 99% so the bar keeps moving instead of freezing at 90%.
      let simulated = 90;
      report({ percent: simulated, phase: "processing", loadedBytes: 0, totalBytes: 0 });
      processingTimer = setInterval(() => {
        simulated = Math.min(99, simulated + 1);
        report({ percent: simulated, phase: "processing", loadedBytes: 0, totalBytes: 0 });
        if (simulated >= 99) stopProcessingTicker();
      }, 400);
    };

    request.onload = async () => {
      stopProcessingTicker();

      if (request.status === 401 && allowRefresh && path !== "/auth/refresh") {
        const outcome = await renewSession();
        if (outcome === "ok") {
          runUpload<T>(path, options, false).then(resolve, reject);
          return;
        }
        if (outcome === "expired") useAuthStore.getState().logout();
      }

      if (request.status >= 200 && request.status < 300) {
        report({ percent: 100, phase: "done", loadedBytes: 0, totalBytes: 0 });
        if (request.status === 204 || !request.responseText) {
          resolve({} as T);
          return;
        }
        try {
          resolve(JSON.parse(request.responseText) as T);
        } catch {
          reject(new Error("The server returned a response that could not be read"));
        }
        return;
      }

      reject(new Error(readErrorMessage(request.responseText)));
    };

    request.onerror = () => {
      stopProcessingTicker();
      reject(new Error("The upload could not reach the server. Check your connection and try again."));
    };
    request.ontimeout = () => {
      stopProcessingTicker();
      reject(new Error("The upload timed out"));
    };
    request.onabort = () => {
      stopProcessingTicker();
      reject(new Error("The upload was cancelled"));
    };

    options.signal?.addEventListener("abort", () => request.abort(), { once: true });

    report({ percent: 0, phase: "uploading", loadedBytes: 0, totalBytes: 0 });
    request.send(options.body);
  });
}

function readErrorMessage(responseText: string): string {
  try {
    const data = JSON.parse(responseText);
    return Array.isArray(data.message) ? data.message.join(", ") : data.message || "Upload failed";
  } catch {
    return "Upload failed";
  }
}
