/**
 * Captures a full set of UI screenshots for documentation and design review:
 * every main route in light, dark, mobile and Arabic/RTL.
 *
 *   node tools/capture-screenshots.mjs [outDir]
 *
 * Requires a running app (default http://localhost:3000) and the E2E user.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.argv[2] ?? "../../tmp/shots/after");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "codex.logo.e2e@example.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "CodexLogoE2E!2026";

const ROUTES = [
  ["dashboard", "/dashboard"],
  ["clients", "/clients"],
  ["tasks", "/tasks"],
  ["calendar", "/calendar"],
  ["team", "/team"],
  ["files", "/files"],
  ["activity", "/activity"],
  ["settings", "/settings"],
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  return page;
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.locator(".skeleton").first().waitFor({ state: "detached" }).catch(() => {});
  await page.waitForTimeout(350);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot:", name);
}

async function applyPrefs(page, { theme, lang }) {
  await page.evaluate(
    ([nextTheme, nextLang]) => {
      localStorage.setItem("theme", nextTheme);
      localStorage.setItem("lang", nextLang);
    },
    [theme, lang],
  );
}

// ---- Desktop, light -------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context);
  await applyPrefs(page, { theme: "light", lang: "en" });

  await page.goto(`${BASE}/login`);
  // Signed in, so /login bounces; capture it in a clean context instead.
  await page.goto(`${BASE}/dashboard`);

  for (const [name, route] of ROUTES) {
    await page.goto(`${BASE}${route}`);
    await shot(page, `light-${name}`);
  }

  // A client profile, which is the densest screen in the app.
  await page.goto(`${BASE}/clients`);
  await settle(page);
  const firstCard = page.locator("main li a").first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForURL(/\/clients\/[a-f0-9]{24}/, { timeout: 15_000 });
    await shot(page, "light-client-detail");
  }

  // The create-client dialog.
  await page.goto(`${BASE}/clients`);
  await settle(page);
  await page.getByRole("button", { name: /new client/i }).first().click();
  await shot(page, "light-modal");

  await context.close();
}

// ---- Desktop, dark --------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context);
  await applyPrefs(page, { theme: "dark", lang: "en" });

  for (const [name, route] of ROUTES) {
    await page.goto(`${BASE}${route}`);
    await shot(page, `dark-${name}`);
  }
  await context.close();
}

// ---- Desktop, Arabic / RTL ------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context);
  await applyPrefs(page, { theme: "light", lang: "ar" });

  for (const name of ["dashboard", "clients", "tasks"]) {
    await page.goto(`${BASE}/${name}`);
    await shot(page, `rtl-${name}`);
  }
  await context.close();
}

// ---- Mobile ---------------------------------------------------------------
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await signIn(context);
  await applyPrefs(page, { theme: "light", lang: "en" });

  for (const name of ["dashboard", "clients", "tasks", "calendar"]) {
    await page.goto(`${BASE}/${name}`);
    await shot(page, `mobile-${name}`);
  }
  await context.close();
}

// ---- Signed-out login screen ---------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await shot(page, "light-login");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await shot(page, "dark-login");
  await context.close();
}

await browser.close();
console.log("screenshots written to", OUT);
