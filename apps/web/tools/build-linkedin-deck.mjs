/**
 * Renders the LinkedIn carousel deck to PDF.
 *
 * Reads tmp/deck-template.html, inlines the screenshots it references, and
 * prints one 1080x1350 page per slide (4:5 — the ratio that takes the most
 * vertical space in the LinkedIn mobile feed).
 *
 *   node tools/build-linkedin-deck.mjs
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TMP = resolve("../../tmp");
const template = readFileSync(resolve(TMP, "deck-template.html"), "utf8");
const shots = JSON.parse(readFileSync(resolve(TMP, "shots.json"), "utf8"));

// Swap every __SHOT:key__ placeholder for its data URI.
const missing = [];
const html = template.replace(/__SHOT:([^_]+(?:_[^_]+)*)__/g, (_match, key) => {
  if (!shots[key]) {
    missing.push(key);
    return "";
  }
  return shots[key];
});
if (missing.length) throw new Error(`missing screenshots: ${missing.join(", ")}`);

const staged = resolve(TMP, "_deck.html");
writeFileSync(staged, html, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(pathToFileURL(staged).href, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const out = resolve(TMP, "media-dose-dashboard-rebuild.pdf");
await page.pdf({
  path: out,
  width: "1080px",
  height: "1350px",
  printBackground: true,
  pageRanges: "1-",
});

const slides = await page.locator("section.slide").count();
await browser.close();
unlinkSync(staged);

if (errors.length) console.warn("page errors:", errors);
console.log(`${slides} slides -> ${out}`);
