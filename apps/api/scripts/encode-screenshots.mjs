/**
 * Compresses the captured screenshots into WebP data URIs and writes
 * tmp/shots.json, which the report page and the LinkedIn deck both inline.
 *
 *   node tools/encode-screenshots.mjs
 */
import sharp from "sharp";
import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../tmp/shots");
const OUT = resolve(import.meta.dirname, "../../../tmp/shots.json");

const result = {};
let bytes = 0;

for (const bucket of ["before", "after"]) {
  for (const file of readdirSync(join(ROOT, bucket))) {
    if (!file.endsWith(".png")) continue;
    const key = `${bucket}/${file.replace(/\.png$/, "")}`;
    // Phone captures are shown small, so they need less width but hold up
    // better at a higher quality.
    const isMobile = file.includes("mobile");
    const buffer = await sharp(join(ROOT, bucket, file))
      .resize({ width: isMobile ? 620 : 1440, withoutEnlargement: true })
      .webp({ quality: isMobile ? 88 : 84 })
      .toBuffer();
    result[key] = `data:image/webp;base64,${buffer.toString("base64")}`;
    bytes += result[key].length;
  }
}

writeFileSync(OUT, JSON.stringify(result));
console.log(Object.keys(result).length, "images ·", (bytes / 1024 / 1024).toFixed(2), "MB base64");
