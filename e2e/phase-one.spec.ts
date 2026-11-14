import { expect, test } from "@playwright/test";
test("球団選択・複数セーブ・手動保存・再読み込み・準備中メニュー", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("radio")).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "この球団で始める" }),
  ).toBeDisabled();
  if (test.info().project.name === "mobile") {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 700 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize(viewport);
  }
  await page.getByRole("radio", { name: "横浜セイラーズ" }).check();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-selection.png`,
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("横浜セイラーズ");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("横浜セイラーズ");
  await page.getByRole("button", { name: "新しいスロットで始める" }).click();
  await page.getByRole("radio", { name: "松山シトラス" }).check();
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(page.locator(".saves li")).toHaveCount(2);
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("横浜セイラーズ");
  await page.getByRole("button", { name: "手動保存" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "現在のスロットに保存しました。",
  );
  await page.reload();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("横浜セイラーズ");
  for (const tab of ["選手", "日程", "データ", "球団運営"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab, exact: true })
      .click();
    await expect(page.locator(".placeholder")).toContainText("準備中");
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ホーム", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const nav = await page.getByRole("navigation").boundingBox();
  expect(nav!.y + nav!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${test.info().project.name}-home.png`,
    fullPage: true,
    scale: "css",
  });
  await page.screenshot({
    path: `test-results/${test.info().project.name}-home-viewport.png`,
    scale: "css",
  });
});
test("保存が拒否された場合は成功表示せずエラーを表示する", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new Error("denied");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "セーブを読み込めませんでした",
  );
  await page.getByRole("radio", { name: "札幌オーロラズ" }).check();
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "操作を完了できませんでした",
  );
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toHaveCount(0);
});

test("randomUUIDが使えない環境でも新規保存・復元できる", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, "randomUUID", { value: undefined });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: "神戸アンカーズ" }).check();
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("神戸アンカーズ");
  await page.getByRole("button", { name: "手動保存" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "現在のスロットに保存しました。",
  );
  await page.reload();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("神戸アンカーズ");
});
