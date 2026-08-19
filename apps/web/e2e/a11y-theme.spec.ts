import { expect, test } from "@playwright/test";
import { setTheme, waitForPage } from "./helpers";

const MAIN_ROUTES = [
  "/dashboard",
  "/clients",
  "/tasks",
  "/calendar",
  "/team",
  "/files",
  "/activity",
  "/settings",
];

test.describe("theme, language and accessibility", () => {
  test("dark mode persists across navigation and reload", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForPage(page);
    await setTheme(page, "dark");

    await page.reload();
    await waitForPage(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.goto("/clients");
    await waitForPage(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The page must actually repaint dark, not merely carry the attribute.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = background.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(200);

    await setTheme(page, "light");
  });

  test("switching to Arabic flips the document to RTL", async ({ page }) => {
    await page.goto("/settings");
    await waitForPage(page);

    await page.getByRole("button", { name: /switch to arabic/i }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Restore English so later tests start from a known state.
    await page.getByRole("button", { name: /switch to english/i }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("each page exposes exactly one h1", async ({ page }) => {
    for (const route of MAIN_ROUTES) {
      await page.goto(route);
      await waitForPage(page);
      await expect(page.getByRole("heading", { level: 1 }), `${route} h1`).toHaveCount(1);
    }
  });

  test("the main navigation is labelled and marks the current page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the sidebar is a drawer on mobile");

    await page.goto("/clients");
    await waitForPage(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Clients");
  });

  test("interactive controls are reachable by keyboard", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "keyboard focus is a desktop concern");

    await page.goto("/clients");
    await waitForPage(page);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON", "INPUT"]).toContain(focused);
  });

  test("no console errors on any main route", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    for (const route of MAIN_ROUTES) {
      await page.goto(route);
      await waitForPage(page);
    }

    expect(errors).toEqual([]);
  });
});
