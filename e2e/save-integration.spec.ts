import { expect, test, type Page } from "@playwright/test";

async function persisted(page: Page, pending = false) {
  return page.evaluate(async (pending) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("fictional-pennant");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const get = (store: string, key: IDBValidKey) =>
      new Promise<any>((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const r = tx.objectStore(store).get(key);
        tx.oncomplete = () => resolve(r.result);
        tx.onabort = () => reject(tx.error);
      });
    try {
      const draft = pending ? await get("drafts", "pending") : null;
      const id = pending ? draft.id : await get("settings", "activeId");
      const meta = pending ? null : await get("saves", id);
      const world = pending ? draft.world : (await get("worlds", id)).world;
      const { phase: _phase, roster: _roster, ...state } = world;
      const bytes = new TextEncoder().encode(JSON.stringify(state));
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      return {
        id: id as string,
        meta: meta as {
          schemaVersion: number;
          teamId: string;
          createdAt: string;
          updatedAt: string;
        } | null,
        seed: world.seed as number,
        hash,
        count: world.players.length as number,
        selected: draft?.selectedTeamId as string | undefined,
        counts: world.players.reduce(
          (counts: Record<string, number>, player: { teamId: string }) => {
            counts[player.teamId] = (counts[player.teamId] ?? 0) + 1;
            return counts;
          },
          {},
        ) as Record<string, number>,
        firstName: world.players[0].name as string,
        privateCount: Object.keys(world.developmentByPlayerId).length,
      };
    } finally {
      db.close();
    }
  }, pending);
}
async function choose(page: Page, name: string) {
  await page.getByRole("radio", { name, exact: true }).check();
  await expect(
    page.getByRole("button", { name: "この球団で始める" }),
  ).toBeEnabled();
}
async function create(page: Page, name: string) {
  await choose(page, name);
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText(name);
}

test("準備プレビューの切替・球団選択・再読み込みでリロールせず、912人を保存する", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "この球団で始める" }),
  ).toBeDisabled();
  await expect(page.locator(".roster-preview")).toBeVisible();
  const before = await persisted(page, true);
  expect(before.count).toBe(912);
  expect(Object.values(before.counts)).toEqual(Array(12).fill(76));
  expect(before.privateCount).toBe(912);
  await page.locator(".roster-preview summary").click();
  await expect(page.locator(".roster-preview li")).toHaveCount(76);
  await expect(page.locator(".roster-preview")).toContainText(before.firstName);
  await page.getByLabel("選手を確認する球団").selectOption("tokyo");
  await expect(page.locator(".roster-preview li")).toHaveCount(76);
  await page.getByLabel("選手を確認する球団").selectOption("sapporo");
  await choose(page, "横浜セイラーズ");
  await choose(page, "松山シトラス");
  expect((await persisted(page, true)).hash).toBe(before.hash);
  await page.reload();
  await expect(page.getByRole("radio", { name: "松山シトラス" })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "この球団で始める" }),
  ).toBeEnabled();
  expect((await persisted(page, true)).hash).toBe(before.hash);
  expect(await page.locator("main").textContent()).not.toMatch(
    /growthType|abilityCaps|成長タイプ|潜在上限|early|standard|late/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("松山シトラス");
  const saved = await persisted(page);
  expect(saved.id).toBe(before.id);
  expect(saved.meta?.schemaVersion).toBe(3);
  expect(saved.seed).toBe(before.seed);
  expect(saved.hash).toBe(before.hash);
  expect(saved.count).toBe(912);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toBeVisible();
  expect((await persisted(page)).hash).toBe(saved.hash);
  await page.getByRole("button", { name: "手動保存" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "現在のスロットに保存しました。",
  );
  expect((await persisted(page)).hash).toBe(saved.hash);
  await page.getByRole("button", { name: "新しいスロットで始める" }).click();
  await expect(page.locator(".roster-preview")).toBeVisible();
  const secondDraft = await persisted(page, true);
  expect(secondDraft.seed).not.toBe(saved.seed);
  await create(page, "東京コメッツ");
  const second = await persisted(page);
  expect(second.hash).not.toBe(saved.hash);
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("松山シトラス");
  expect((await persisted(page)).hash).toBe(saved.hash);
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("東京コメッツ");
  expect((await persisted(page)).hash).toBe(second.hash);
});

async function installLegacy(page: Page) {
  await page.route("**/__seed_legacy__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Test seed</title>",
    }),
  );
  await page.goto("/__seed_legacy__");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("fictional-pennant", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("saves", { keyPath: "id" });
        r.result.createObjectStore("settings");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["saves", "settings"], "readwrite");
      tx.objectStore("saves").put({
        schemaVersion: 1,
        id: "old-slot",
        teamId: "kobe",
        createdAt: "2026-11-01T01:00:00.000Z",
        updatedAt: "2026-11-02T02:00:00.000Z",
      });
      tx.objectStore("settings").put("old-slot", "activeId");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  });
  await page.unroute("**/__seed_legacy__");
}
test("旧DBから起動し、球団・ID・日時を維持して移行・再読み込みできる", async ({
  page,
}) => {
  await installLegacy(page);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("神戸アンカーズ");
  const first = await persisted(page);
  expect(first.id).toBe("old-slot");
  expect(first.meta).toMatchObject({
    schemaVersion: 3,
    teamId: "kobe",
    createdAt: "2026-11-01T01:00:00.000Z",
    updatedAt: "2026-11-02T02:00:00.000Z",
  });
  expect(first.count).toBe(912);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toBeVisible();
  expect(await persisted(page)).toEqual(first);
});

test("移行の容量不足をエラー表示し、旧データを保持する", async ({ page }) => {
  await installLegacy(page);
  await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === "worlds")
        throw new DOMException("full", "QuotaExceededError");
      return key === undefined
        ? add.call(this, value)
        : add.call(this, value, key);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("保存容量が不足");
  await expect(page.getByRole("status")).not.toContainText("読み込みました");
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("fictional-pennant");
        r.onsuccess = () => resolve(r.result);
      });
      return new Promise<number>((resolve) => {
        const tx = db.transaction("saves", "readonly");
        const r = tx.objectStore("saves").get("old-slot");
        tx.oncomplete = () => {
          db.close();
          resolve(r.result.schemaVersion);
        };
      });
    }),
  ).toBe(1);
});

test("新規保存の容量不足で成功表示せず、同じ準備世界から再試行できる", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "新潟リヴァーズ");
  const before = await persisted(page, true);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === "worlds")
        throw new DOMException("full", "QuotaExceededError");
      return key === undefined
        ? add.call(this, value)
        : add.call(this, value, key);
    };
  });
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(page.getByRole("alert")).toContainText("保存容量が不足");
  await expect(page.getByRole("status")).not.toContainText("作成しました");
  await expect(page.locator(".saves li")).toHaveCount(0);
  expect((await persisted(page, true)).hash).toBe(before.hash);
  await page.reload();
  await create(page, "新潟リヴァーズ");
  expect((await persisted(page)).hash).toBe(before.hash);
});
