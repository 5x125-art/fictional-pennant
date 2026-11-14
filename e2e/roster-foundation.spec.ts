import { expect, test, type Page } from "@playwright/test";
import { setupSave } from "./helpers/player-fixture";
import { teams } from "../src/data/teams";
async function playersMenu(page: Page) {
  await page
    .getByRole("navigation", { name: "メインメニュー" })
    .getByRole("button", { name: "選手", exact: true })
    .click();
  await expect(page.getByLabel("表示する球団")).toBeVisible();
}
async function rawSnapshot(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("fictional-pennant");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<{
      meta: any;
      body: any;
      active: any;
      dbVersion: number;
    }>((resolve, reject) => {
      const tx = db.transaction(["saves", "worlds", "settings"], "readonly");
      const meta = tx.objectStore("saves").get(id),
        body = tx.objectStore("worlds").get(id),
        active = tx.objectStore("settings").get("activeId");
      tx.oncomplete = () => {
        const dbVersion = db.version;
        db.close();
        resolve({
          meta: meta.result,
          body: body.result,
          active: active.result,
          dbVersion,
        });
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  }, id);
}
async function installV2(page: Page) {
  await page.route("**/__legacy_roster__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>v2 fixture</title>",
    }),
  );
  await page.goto("/__legacy_roster__");
  await page.evaluate(async () => {
    const storagePath = "/src/storage/saves.ts",
      generatorPath = "/src/game/players/generate.ts";
    await (await import(storagePath)).readSaves();
    const { phase: _phase, ...world } = (
      await import(generatorPath)
    ).generateInitialPlayerWorld(28573);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("fictional-pennant");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["saves", "worlds", "settings"], "readwrite");
      tx.objectStore("saves").put({
        schemaVersion: 2,
        id: "legacy-v2",
        teamId: "kobe",
        initialSeed: world.seed,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });
      tx.objectStore("worlds").put({ id: "legacy-v2", world });
      tx.objectStore("settings").put("legacy-v2", "activeId");
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
  await page.unroute("**/__legacy_roster__");
  return rawSnapshot(page, "legacy-v2");
}

test("全12球団の所属を読み取り専用表示し、保存・再読込で所属と抹消日を保持する", async ({
  page,
}) => {
  // 12球団の描画確認と完全な世界スナップショット比較・再読み込みを含む。
  test.setTimeout(60_000);
  const roster = await setupSave(page),
    before = await rawSnapshot(page, roster.saveId);
  expect(before.meta.schemaVersion).toBe(3);
  expect(before.dbVersion).toBe(2);
  await playersMenu(page);
  for (const team of teams) {
    await page.getByLabel("表示する球団").selectOption(team.id);
    await expect(page.locator(".squad-tag.first")).toHaveCount(31);
    await expect(page.locator(".squad-tag.farm")).toHaveCount(45);
    const development = page
      .locator(".player-row")
      .filter({ has: page.locator(".registration-tag.development") });
    await expect(development).toHaveCount(8);
    await expect(development.locator(".squad-tag.farm")).toHaveCount(8);
  }
  await page.getByLabel("表示する球団").selectOption("own");
  await expect(page.locator(".roster-registration-count")).toHaveText(
    "自球団の1軍登録：31人 / 上限31人",
  );
  await page
    .locator(".search-result-count")
    .evaluate((e) =>
      window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 24),
    );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-roster-list.png`,
    scale: "css",
  });
  const first = roster.players.find(
    (p) => p.teamId === "yokohama" && p.squad === "first",
  )!;
  await page
    .getByRole("button", { name: `${first.name}の詳細`, exact: true })
    .click();
  await expect(page.locator(".squad-detail")).toHaveText("現在所属：1軍");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-roster-detail.png`,
    scale: "css",
  });
  await page.getByRole("button", { name: "選手一覧に戻る" }).click();
  const farm = roster.players.find(
    (p) => p.teamId === "yokohama" && p.registration === "development",
  )!;
  await page
    .getByRole("button", { name: `${farm.name}の詳細`, exact: true })
    .click();
  await expect(page.locator(".squad-detail")).toHaveText("現在所属：2軍");
  expect(await rawSnapshot(page, roster.saveId)).toEqual(before);
  // 将来のゲーム処理で変更済みの状態をfixtureとして保存。UIによる登録操作は設けない。
  await page.evaluate(
    async ({ id, playerId }) => {
      const savePath = "/src/storage/saves.ts",
        rosterPath = "/src/game/roster/roster.ts";
      const save = await (await import(savePath)).readGameSave(id),
        api = await import(rosterPath);
      const changed = api.deregisterFirstTeam(
        save.world.players,
        save.world.roster,
        "yokohama",
        playerId,
      );
      if (!changed.ok) throw Error();
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("fictional-pennant");
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("worlds", "readwrite");
        tx.objectStore("worlds").put({
          id,
          world: { ...save.world, roster: { ...changed.state, currentDay: 9 } },
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
    },
    { id: roster.saveId, playerId: first.id },
  );
  const changed = await rawSnapshot(page, roster.saveId);
  await page.reload();
  await playersMenu(page);
  await expect(page.locator(".squad-tag.first")).toHaveCount(30);
  await expect(
    page
      .getByRole("button", { name: `${first.name}の詳細`, exact: true })
      .locator(".squad-tag"),
  ).toHaveText("2軍");
  expect(await rawSnapshot(page, roster.saveId)).toEqual(changed);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator(".player-screen").textContent()).not.toMatch(
    /growthType|abilityCaps|developmentByPlayerId|completedJapanSeasons/,
  );
});

test("既存v2は全選手情報・日時・乱数を保持してv3に移行し、再読込しても所属が変わらない", async ({
  page,
}) => {
  const old = await installV2(page);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("神戸アンカーズ");
  const migrated = await rawSnapshot(page, "legacy-v2");
  expect(migrated.meta).toEqual({ ...old.meta, schemaVersion: 3 });
  const { roster, ...playerWorld } = migrated.body.world;
  expect(playerWorld).toEqual(old.body.world);
  expect(Object.keys(roster.byTeam)).toHaveLength(12);
  await page.reload();
  expect(await rawSnapshot(page, "legacy-v2")).toEqual(migrated);
  await playersMenu(page);
  await expect(page.locator(".squad-tag.first")).toHaveCount(31);
});

test("v2移行で最後の書込が失敗しても旧本体・日時を保護し、エラーを表示する", async ({
  page,
}) => {
  const old = await installV2(page);
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "settings")
        throw new DOMException("full", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "前回のスロットを読み込めませんでした",
  );
  expect(await rawSnapshot(page, "legacy-v2")).toEqual(old);
  await expect(
    page.getByRole("button", { name: "この球団で始める" }),
  ).toBeVisible();
});
