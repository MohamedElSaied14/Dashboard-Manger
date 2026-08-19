import { expect, test, type Page } from "@playwright/test";
import { waitForPage } from "./helpers";

/** Page content only — keeps the sidebar's own list items out of every count. */
const content = (page: Page) => page.getByRole("main");

test.describe("workspace", () => {
  test("dashboard shows live metrics from the API", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForPage(page);

    await expect(page.getByText("Active clients")).toBeVisible();
    await expect(page.getByText("Open tasks")).toBeVisible();

    // With seeded data the counters must not all read zero.
    await expect
      .poll(async () => {
        const values = await content(page).locator("p.tabular-nums").allInnerTexts();
        return values.filter((value) => Number(value.replace(/\D/g, "")) > 0).length;
      })
      .toBeGreaterThan(0);
  });

  test("client list opens a client profile", async ({ page }) => {
    await page.goto("/clients");
    await waitForPage(page);

    const firstCard = content(page).getByRole("listitem").first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByRole("link").first().click();

    await expect(page).toHaveURL(/\/clients\/[a-f0-9]{24}/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: /client profile/i })).toBeVisible();
  });

  test("tasks can be filtered and toggled", async ({ page }) => {
    await page.goto("/tasks");
    await waitForPage(page);

    const items = content(page).getByRole("listitem");
    await expect(items.first()).toBeVisible();
    const allCount = await items.count();

    await page.getByRole("tab", { name: "Done" }).click();
    expect(await items.count()).toBeLessThanOrEqual(allCount);

    await page.getByRole("tab", { name: "All" }).click();
    const checkbox = content(page).getByRole("checkbox").first();
    const before = await checkbox.getAttribute("aria-checked");
    await checkbox.click();
    // The optimistic update flips the control before the request resolves.
    await expect(checkbox).not.toHaveAttribute("aria-checked", before ?? "false");

    // Put it back so the suite stays idempotent.
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", before ?? "false");
  });

  test("calendar renders the current month and can be paged", async ({ page }) => {
    await page.goto("/calendar");
    await waitForPage(page);

    const monthLabel = page.getByTestId("calendar-month");
    const current = await monthLabel.innerText();
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(monthLabel).not.toHaveText(current);
    await page.getByRole("button", { name: /today/i }).click();
    await expect(monthLabel).toHaveText(current);
  });

  test("search filters the client list", async ({ page }) => {
    await page.goto("/clients");
    await waitForPage(page);

    const cards = content(page).getByRole("listitem");
    await expect(cards.first()).toBeVisible();
    await expect.poll(() => cards.count()).toBeGreaterThan(1);

    await page.getByRole("searchbox").fill("Andalusia");
    await expect(cards).toHaveCount(1, { timeout: 10_000 });
    await expect(cards.first()).toContainText(/Andalusia/i);

    // Clear it so the shared search store doesn't leak into the next test.
    await page.getByRole("searchbox").fill("");
    await expect.poll(() => cards.count()).toBeGreaterThan(1);
  });

  test("creating a client validates required fields", async ({ page }) => {
    await page.goto("/clients");
    await waitForPage(page);

    await page.getByRole("button", { name: /new client/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Submitting an empty form must not close the dialog.
    await dialog.getByRole("button", { name: /submit/i }).click();
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
