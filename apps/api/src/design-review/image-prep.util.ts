import { Logger } from "@nestjs/common";
import sharp from "sharp";

const logger = new Logger("ImagePrep");

/**
 * Vision cost is driven by pixels, and the same design/logo/reference image used to be fetched and
 * re-uploaded at full size by every one of the ~20 calls a single review makes.
 *
 * ImageCache fetches each URL at most once per review and hands out a downscaled JPEG data URL.
 * 1024px on the long edge is above what the "high" detail tiler actually consumes (it works on
 * 512px tiles after fitting the short side to 768px), so this trims transferred bytes and tiles
 * without removing evidence the model was previously able to see.
 */
export class ImageCache {
  private readonly buffers = new Map<string, Promise<Buffer | null>>();
  private readonly encoded = new Map<string, Promise<string>>();

  async buffer(url: string): Promise<Buffer | null> {
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = this.fetchBuffer(url);
      this.buffers.set(url, pending);
    }
    return pending;
  }

  /**
   * Returns a data URL for the image, downscaled to `maxEdge` on its longest side.
   * Falls back to the original URL when the image cannot be fetched or re-encoded, so a
   * transient network problem degrades to "slightly more expensive" rather than "no evidence".
   */
  async compact(url: string, maxEdge = 1024, quality = 82): Promise<string> {
    const key = `${url}|${maxEdge}|${quality}`;
    let pending = this.encoded.get(key);
    if (!pending) {
      pending = this.encode(url, maxEdge, quality);
      this.encoded.set(key, pending);
    }
    return pending;
  }

  private async encode(url: string, maxEdge: number, quality: number): Promise<string> {
    try {
      const buffer = await this.buffer(url);
      if (!buffer) return url;
      const optimized = await compactImageBuffer(buffer, maxEdge, quality);
      return `data:image/jpeg;base64,${optimized.toString("base64")}`;
    } catch (error: any) {
      logger.warn(`Could not compact image (${error?.message ?? error}); using the original URL.`);
      return url;
    }
  }

  private async fetchBuffer(url: string): Promise<Buffer | null> {
    try {
      if (url.startsWith("data:")) {
        const base64 = url.slice(url.indexOf(",") + 1);
        return Buffer.from(base64, "base64");
      }
      const response = await fetch(url);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch (error: any) {
      logger.warn(`Could not fetch image ${url}: ${error?.message ?? error}`);
      return null;
    }
  }
}

export async function compactImageBuffer(
  buffer: Buffer,
  maxEdge = 1024,
  quality = 82,
): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  const pipeline = longestEdge > maxEdge
    ? image.resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    : image;
  return pipeline.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
}

/**
 * JSON that goes into a prompt: no pretty-print indentation (it is pure token cost), and
 * empty/undefined branches dropped so the model is not asked to read `"x": null` noise.
 */
export function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item === null || item === undefined) return undefined;
    if (Array.isArray(item) && item.length === 0) return undefined;
    if (typeof item === "number" && Number.isFinite(item)) {
      return Math.abs(item) < 1000 ? Math.round(item * 100) / 100 : Math.round(item);
    }
    return item;
  }) ?? "{}";
}
