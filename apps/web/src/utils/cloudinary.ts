export function cloudinaryThumbnail(url?: string, width = 480): string {
  if (!url || !url.includes("/upload/")) return url ?? "";
  return url.replace(
    "/upload/",
    `/upload/f_auto,q_auto:eco,w_${Math.max(80, Math.min(1200, width))},c_limit/`,
  );
}
