import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Web — layout & Todo UI", () => {
  test.beforeEach(async () => {
    const Database = (await import("better-sqlite3")).default;
    const path = (await import("path")).default;
    const sqlitePath = path.join(
      process.env.PW_TEST_PROJECT_ROOT ?? process.cwd(),
      "data",
      "sqlite.db",
    );
    const db = new Database(sqlitePath);
    db.exec("DELETE FROM todos");
    db.close();
  });

  test("WEB-L-01: page title and meta description", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Dailywork — Todo/);
    const desc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(desc?.toLowerCase()).toContain("sqlite");
  });

  test("WEB-L-02: body layout classes", async ({ page }) => {
    await page.goto("/");
    const bodyClass = await page.locator("body").getAttribute("class");
    expect(bodyClass).toMatch(/min-h-full/);
    expect(bodyClass).toMatch(/flex/);
    expect(bodyClass).toMatch(/flex-col/);
    const main = page.locator(".max-w-lg");
    await expect(main).toBeVisible();
  });

  test("TODO-R-01: empty list message", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No tasks yet. Add one above.")).toBeVisible();
  });

  test("TODO-R-02: newest todo appears first (id desc)", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("first");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("What needs to be done?").fill("second");
    await page.getByRole("button", { name: "Add" }).click();
    const titles = page.locator("ul li span.text-sm");
    await expect(titles.first()).toContainText("second");
    await expect(titles.nth(1)).toContainText("first");
  });

  test("TODO-R-03: response not long-lived cached as static", async ({
    page,
  }) => {
    const res = await page.goto("/");
    expect(res).not.toBeNull();
    const cc = res!.headers()["cache-control"] ?? "";
    expect(cc).toMatch(/no-store|must-revalidate|max-age=0|private/);
  });

  test("TODO-A-01: add todo 买牛奶", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("买牛奶");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("买牛奶")).toBeVisible();
    const row = page.locator("li", { hasText: "买牛奶" });
    await expect(
      row.getByRole("button", { name: "Mark as done" }),
    ).toBeVisible();
  });

  test("TODO-A-02: trim whitespace in title", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("  任务  ");
    await page.getByRole("button", { name: "Add" }).click();
    const titleSpan = page.locator("li", { hasText: "任务" }).locator("span.text-sm");
    await expect(titleSpan).toHaveText("任务");
  });

  test("TODO-A-03: whitespace-only does not add row", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("   ");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("No tasks yet. Add one above.")).toBeVisible();
  });

  test("TODO-T-01 / TODO-T-02: toggle done and undo", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("toggle me");
    await page.getByRole("button", { name: "Add" }).click();
    const row = page.locator("li", { hasText: "toggle me" });
    await row.getByRole("button", { name: "Mark as done" }).click();
    await expect(row.locator("span").first()).toHaveClass(/line-through/);
    await row.getByRole("button", { name: "Mark as not done" }).click();
    await expect(row.locator("span").first()).not.toHaveClass(/line-through/);
  });

  test("TODO-T-03: invalid toggle id is ignored", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("stable");
    await page.getByRole("button", { name: "Add" }).click();
    const row = page.locator("li", { hasText: "stable" });
    await row
      .locator("form")
      .first()
      .locator('input[name="id"]')
      .evaluate((el) => {
        (el as HTMLInputElement).value = "not-a-number";
      });
    await row.locator("form").first().getByRole("button").click();
    await expect(page.getByText("stable")).toBeVisible();
    await expect(
      row.getByRole("button", { name: "Mark as done" }),
    ).toBeVisible();
  });

  test("TODO-T-04: toggle non-existent id does not crash", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("only");
    await page.getByRole("button", { name: "Add" }).click();
    const row = page.locator("li", { hasText: "only" });
    await row
      .locator("form")
      .first()
      .locator('input[name="id"]')
      .evaluate((el) => {
        (el as HTMLInputElement).value = "999999";
      });
    await row.locator("form").first().getByRole("button").click();
    await expect(page.getByText("only")).toBeVisible();
  });

  test("TODO-D-01: remove todo", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("delete me");
    await page.getByRole("button", { name: "Add" }).click();
    await page
      .locator("li", { hasText: "delete me" })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(page.getByText("delete me")).toHaveCount(0);
  });

  test("TODO-D-02: invalid delete id ignored", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("What needs to be done?").fill("keep");
    await page.getByRole("button", { name: "Add" }).click();
    const row = page.locator("li", { hasText: "keep" });
    await row
      .locator("form")
      .nth(1)
      .locator('input[name="id"]')
      .evaluate((el) => {
        (el as HTMLInputElement).value = "bad";
      });
    await row.locator("form").nth(1).getByRole("button").click();
    await expect(page.getByText("keep")).toBeVisible();
  });
});
