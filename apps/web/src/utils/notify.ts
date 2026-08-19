export type NotificationKind = "success" | "error" | "info";

export function notify(message: string, kind: NotificationKind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("accountflow:notify", {
    detail: { message, kind },
  }));
}
