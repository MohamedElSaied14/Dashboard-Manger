import path from "node:path";
import type { Page } from "@playwright/test";

export const CREDENTIALS = {
  email: process.env.E2E_EMAIL ?? "codex.logo.e2e@example.test",
  password: process.env.E2E_PASSWORD ?? "CodexLogoE2E!2026",
};

/** Where the shared signed-in session is stored by auth.setup.ts. */
export const STORAGE_STATE = path.join(__dirname, ".auth", "user.json");

/** Switches the interface between light and dark. */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => {
    localStorage.setItem("theme", value);
    document.documentElement.dataset.theme = value;
  }, theme);
}

/**
 * Waits until a page has rendered *and* its queries have settled.
 *
 * Waiting only for the absence of skeletons is racy — they may not have been
 * inserted yet — so this also waits for the network to go quiet.
 */
export async function waitForPage(page: Page) {
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.locator(".skeleton").first().waitFor({ state: "detached" }).catch(() => {});
}
