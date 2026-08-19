import { test as setup } from "@playwright/test";
import { CREDENTIALS, STORAGE_STATE } from "./helpers";

/**
 * Signs in once and saves the session. Every spec reuses it, which keeps the
 * suite fast and avoids tripping the API's login/refresh rate limits.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(CREDENTIALS.email);
  await page.locator('input[type="password"]').fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await page.getByRole("heading", { level: 1 }).waitFor();

  await page.context().storageState({ path: STORAGE_STATE });
});
