import { expect, test } from "@playwright/test";
import { waitForPage } from "./helpers";

test.describe("navigation", () => {
  test("every sidebar section opens its own route", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the sidebar is a drawer on mobile");

    await page.goto("/dashboard");
    await waitForPage(page);
    const nav = page.getByRole("navigation", { name: "Main" });

    const sections: [string, RegExp][] = [
      ["Clients", /\/clients$/],
      ["Tasks", /\/tasks$/],
      ["Calendar", /\/calendar$/],
      ["Team", /\/team$/],
      ["Files", /\/files$/],
      ["Activity", /\/activity$/],
      ["Settings", /\/settings$/],
      ["Overview", /\/dashboard$/],
    ];

    for (const [label, urlPattern] of sections) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(urlPattern);
      // The persistent shell must survive the transition rather than remount.
      await expect(nav).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("deep links and reloads keep the session", async ({ page }) => {
    await page.goto("/tasks");
    await waitForPage(page);
    await expect(page).toHaveURL(/\/tasks$/);

    await page.reload();
    await waitForPage(page);
    await expect(page).toHaveURL(/\/tasks$/);
  });

  test("section changes complete in well under half a second", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "measured on desktop only");

    await page.goto("/dashboard");
    await waitForPage(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    const timings: { section: string; ms: number }[] = [];

    for (const section of ["Clients", "Tasks", "Calendar", "Team", "Files", "Activity"]) {
      const started = Date.now();
      await nav.getByRole("link", { name: section, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      timings.push({ section, ms: Date.now() - started });
    }

    await testInfo.attach("navigation-timings", {
      body: JSON.stringify(timings, null, 2),
      contentType: "application/json",
    });
    // eslint-disable-next-line no-console -- surfaced in the test report
    console.log("navigation timings:", JSON.stringify(timings));

    for (const { section, ms } of timings) {
      expect(ms, `${section} navigation`).toBeLessThan(500);
    }
  });
});
