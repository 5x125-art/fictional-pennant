import { expect, test, type Page } from "@playwright/test";

const cases = [
  { label: "破損した旧セーブのみ", schema: 1, active: false, healthy: false },
  {
    label: "未対応セーブと正常スロットの混在",
    schema: 99,
    active: false,
    healthy: true,
  },
  {
    label: "アクティブ本体の破損と正常スロットの混在",
    schema: 2,
    active: true,
    healthy: true,
  },
  {
    label: "アクティブ旧セーブの破損",
    schema: 1,
    active: true,
    healthy: false,
  },
];
async function protectedRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("fictional-pennant");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["saves", "worlds"], "readonly");
      const metadata = tx.objectStore("saves").get("bad");
      const body = tx.objectStore("worlds").get("bad");
      tx.oncomplete = () => {
        db.close();
        resolve({ metadata: metadata.result, body: body.result });
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  });
}
for (const scenario of cases) {
  test(`${scenario.label}でもエラーを残して新規作成・正常スロット読み込みが可能`, async ({
    page,
  }) => {
    await page.route("**/__seed_recovery__", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Recovery fixture</title>",
      }),
    );
    await page.goto("/__seed_recovery__");
    await page.evaluate(async (scenario) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("fictional-pennant", 2);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("saves", { keyPath: "id" });
          r.result.createObjectStore("settings");
          r.result.createObjectStore("worlds", { keyPath: "id" });
          r.result.createObjectStore("drafts", { keyPath: "key" });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["saves", "settings", "worlds"], "readwrite");
        const base = {
          schemaVersion: 1,
          id: "healthy",
          teamId: "kobe",
          createdAt: "2026-11-01T01:00:00.000Z",
          updatedAt: "2026-11-02T02:00:00.000Z",
        };
        tx.objectStore("saves").put({
          ...base,
          id: "bad",
          teamId: "yokohama",
          schemaVersion: scenario.schema,
          updatedAt: scenario.schema === 1 ? "broken-date" : base.updatedAt,
          ...(scenario.schema === 2 ? { initialSeed: 42 } : {}),
          marker: "保護する元データ",
        });
        if (scenario.healthy) tx.objectStore("saves").put(base);
        if (scenario.active) tx.objectStore("settings").put("bad", "activeId");
        if (scenario.schema === 2)
          tx.objectStore("worlds").put({
            id: "bad",
            world: {
              generationVersion: 1,
              seed: 42,
              randomState: -1,
              players: [],
              developmentByPlayerId: {},
            },
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      });
    }, scenario);
    const before = await protectedRecords(page);
    await page.unroute("**/__seed_recovery__");
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText(
      scenario.schema === 99 ? "未対応" : "破損",
    );
    await expect(page.locator(".roster-preview")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "現在の操作球団" }),
    ).toHaveCount(0);
    if (scenario.schema === 2)
      await expect(
        page
          .locator(".saves li")
          .filter({ hasText: "横浜セイラーズ" })
          .getByRole("button", { name: "読み込む", exact: true }),
      ).toBeEnabled();
    // 警告は球団候補の保存や新規ゲーム操作で消えない。
    await page.getByRole("radio", { name: "札幌オーロラズ" }).check();
    await expect(
      page.getByRole("button", { name: "この球団で始める" }),
    ).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(
      scenario.schema === 99 ? "未対応" : "破損",
    );
    expect(await protectedRecords(page)).toEqual(before);
    if (scenario.healthy) {
      await page
        .locator(".saves li")
        .filter({ hasText: "神戸アンカーズ" })
        .getByRole("button", { name: "読み込む", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "現在の操作球団" }),
      ).toContainText("神戸アンカーズ");
      await page
        .getByRole("button", { name: "新しいスロットで始める" })
        .click();
      await expect(
        page.getByRole("button", { name: "この球団で始める" }),
      ).toBeEnabled();
    }
    await page.getByRole("button", { name: "この球団で始める" }).click();
    await expect(
      page.getByRole("region", { name: "現在の操作球団" }),
    ).toContainText("札幌オーロラズ");
    await expect(page.getByRole("status")).toHaveText(
      "新しいセーブを作成しました。",
    );
    expect(await protectedRecords(page)).toEqual(before);
    await expect(page.getByRole("alert")).toContainText(
      scenario.schema === 99 ? "未対応" : "破損",
    );
    await page.reload();
    await expect(
      page.getByRole("region", { name: "現在の操作球団" }),
    ).toContainText("札幌オーロラズ");
    expect(await protectedRecords(page)).toEqual(before);
  });
}
