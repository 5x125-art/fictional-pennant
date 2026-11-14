import { expect, test, type Locator, type Page } from "@playwright/test";
import { pitchLabels } from "../src/components/players/labels";
import { teams } from "../src/data/teams";
import { abilityRank } from "../src/game/players/rank";
import {
  battingAverage,
  earnedRunAverage,
  inningsPitched,
} from "../src/game/players/statistics";
import type { PublicRoster } from "../src/storage/playerViews";

async function setupSave(page: Page): Promise<PublicRoster> {
  await page.route("**/__seed_players__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Players fixture</title>",
    }),
  );
  await page.goto("/__seed_players__");
  const roster = await page.evaluate(async () => {
    const savePath = "/src/storage/saves.ts";
    const viewsPath = "/src/storage/playerViews.ts";
    const storage = await import(savePath);
    const draft = await storage.prepareNewGame();
    await storage.selectDraftTeam(draft.id, "yokohama");
    await storage.newSave("yokohama", draft.id);
    return (await import(viewsPath)).readPublicRoster(draft.id);
  });
  await page.unroute("**/__seed_players__");
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("横浜セイラーズ");
  return roster;
}
async function menu(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "メインメニュー" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function metric(
  page: Page,
  scope: Locator,
  label: string,
  value: number | string,
) {
  const term = scope
    .locator("dt")
    .filter({ hasText: new RegExp(`^${label}$`) });
  await expect(term.locator("..").locator("dd")).toHaveText(String(value));
}
async function privateAbsent(page: Page) {
  expect(await page.locator(".player-screen").textContent()).not.toMatch(
    /developmentByPlayerId|growthType|abilityCaps|潜在上限|成長タイプ|OVR|特殊能力|捕手リード/,
  );
}

test("12球団の一覧と投手・野手のタブ詳細が保存済み公開データと一致する", async ({
  page,
}) => {
  const roster = await setupSave(page);
  await menu(page, "選手");
  const list = page.getByRole("region", { name: "選手一覧", exact: true });
  await expect(
    list.getByRole("heading", { name: "横浜セイラーズ", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".roster-own-label")).toHaveText("自球団");
  for (const team of teams) {
    await page.getByLabel("表示する球団").selectOption(team.id);
    await expect(page.locator(".player-list > li")).toHaveCount(76);
    await expect(
      page.getByRole("region", { name: "投手一覧", exact: true }).locator("li"),
    ).toHaveCount(38);
    await expect(
      page.getByRole("region", { name: "野手一覧", exact: true }).locator("li"),
    ).toHaveCount(38);
    await expect(page.locator(".registration-tag.development")).toHaveCount(8);
    const expected = roster.players.filter(
      (player) => player.teamId === team.id,
    );
    for (const kind of ["pitcher", "fielder"] as const) {
      const first = expected.find((player) => player.kind === kind)!;
      await expect(
        page.getByRole("button", { name: `${first.name}の詳細`, exact: true }),
      ).toBeVisible();
    }
  }
  await page.getByLabel("表示する球団").selectOption("yokohama");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${test.info().project.name}-players-list.png`,
    scale: "css",
  });
  const own = roster.players.filter((player) => player.teamId === "yokohama");
  const pitcher = own.find(
    (player) => player.kind === "pitcher" && player.history.length > 0,
  )!;
  if (pitcher.kind !== "pitcher") throw new Error("投手が必要");
  const card = page.getByRole("button", {
    name: `${pitcher.name}の詳細`,
    exact: true,
  });
  await expect(card).toContainText(`${pitcher.age}歳`);
  await expect(card.locator(".major-value").nth(0)).toHaveText(
    `${pitcher.abilities.velocityKmh} km/h`,
  );
  await expect(card.locator(".major-value").nth(1)).toHaveText(
    `${pitcher.abilities.control}${abilityRank(pitcher.abilities.control)}`,
  );
  await card.click();
  let detail = page.getByRole("region", { name: "選手詳細", exact: true });
  await expect(
    detail.getByRole("heading", { name: pitcher.name, exact: true }),
  ).toBeVisible();
  await metric(
    page,
    detail.locator(".detail-panel > .ability-grid").first(),
    "制球",
    `${pitcher.abilities.control}${abilityRank(pitcher.abilities.control)}`,
  );
  await metric(
    page,
    detail.locator(".detail-panel > .ability-grid").first(),
    "スタミナ",
    `${pitcher.abilities.stamina}${abilityRank(pitcher.abilities.stamina)}`,
  );
  await metric(
    page,
    detail.locator(".detail-panel > .ability-grid").first(),
    "先発適性",
    `${pitcher.abilities.starterSuitability}${abilityRank(pitcher.abilities.starterSuitability)}`,
  );
  await metric(
    page,
    detail.locator(".detail-panel > .ability-grid").first(),
    "救援適性",
    `${pitcher.abilities.reliefSuitability}${abilityRank(pitcher.abilities.reliefSuitability)}`,
  );
  await expect(detail.locator(".pitch-card")).toHaveCount(
    pitcher.abilities.pitches.length,
  );
  for (const pitch of pitcher.abilities.pitches) {
    const scope = detail.getByRole("region", {
      name: pitchLabels[pitch.type],
      exact: true,
    });
    await metric(
      page,
      scope,
      "球威",
      `${pitch.power}${abilityRank(pitch.power)}`,
    );
    await metric(
      page,
      scope,
      "制球",
      `${pitch.control}${abilityRank(pitch.control)}`,
    );
    await metric(page, scope, "変化量", pitch.movement);
  }
  await privateAbsent(page);
  await detail.screenshot({
    path: `test-results/${test.info().project.name}-pitcher-detail.png`,
    scale: "css",
    style: ".bottom-nav { visibility: hidden !important; }",
  });
  await detail.getByRole("tab", { name: "成績", exact: true }).click();
  await expect(detail).toContainText("試合処理は未実装");
  const last = pitcher.history.at(-1)!;
  for (const level of ["firstTeam", "farmTeam"] as const) {
    const stats = last[level];
    const label = level === "firstTeam" ? "1軍" : "2軍";
    const scope = detail.getByRole("region", {
      name: `${-last.season}シーズン前の${label}成績`,
      exact: true,
    });
    await metric(
      page,
      scope,
      "防御率",
      earnedRunAverage(stats.earnedRuns, stats.outs),
    );
    await metric(page, scope, "投球回", inningsPitched(stats.outs));
    await metric(page, scope, "登板", stats.games);
  }
  await detail.screenshot({
    path: `test-results/${test.info().project.name}-player-statistics.png`,
    scale: "css",
    style: ".bottom-nav { visibility: hidden !important; }",
  });
  await detail.getByRole("tab", { name: "成長", exact: true }).click();
  await expect(detail.getByRole("tabpanel")).toHaveText("成長記録は準備中");
  await detail.getByRole("tab", { name: "契約", exact: true }).click();
  await metric(
    page,
    detail,
    "年俸",
    `${pitcher.contract.annualSalaryManYen.toLocaleString("ja-JP")}万円`,
  );
  await metric(
    page,
    detail,
    "完了済みプロ在籍",
    `${pitcher.career.completedProSeasons}シーズン`,
  );
  await metric(page, detail, "契約年数", `${pitcher.contract.years}年`);
  await metric(
    page,
    detail,
    "外国人選手",
    pitcher.isForeign ? "はい" : "いいえ",
  );
  await privateAbsent(page);
  await detail.getByRole("button", { name: "選手一覧に戻る" }).click();
  const fielder = own.find(
    (player) => player.kind === "fielder" && player.history.length > 0,
  )!;
  if (fielder.kind !== "fielder") throw new Error("野手が必要");
  await page
    .getByRole("button", { name: `${fielder.name}の詳細`, exact: true })
    .click();
  detail = page.getByRole("region", { name: "選手詳細", exact: true });
  for (const [label, key] of [
    ["対右ミート", "contactVsRight"],
    ["対左ミート", "contactVsLeft"],
    ["パワー", "power"],
    ["走力", "speed"],
    ["盗塁", "stealing"],
    ["捕球", "catching"],
    ["スローイング", "throwing"],
    ["肩力", "arm"],
  ] as const) {
    await metric(
      page,
      detail,
      label,
      `${fielder.abilities[key]}${abilityRank(fielder.abilities[key])}`,
    );
  }
  await metric(page, detail, "弾道", fielder.abilities.trajectory);
  const labels = {
    C: "捕手",
    "1B": "一塁",
    "2B": "二塁",
    "3B": "三塁",
    SS: "遊撃",
    LF: "左翼",
    CF: "中堅",
    RF: "右翼",
  };
  for (const position of Object.keys(labels) as (keyof typeof labels)[])
    await metric(
      page,
      detail,
      labels[position],
      `${fielder.positionAptitudes[position]}${abilityRank(fielder.positionAptitudes[position])}`,
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await privateAbsent(page);
  await detail.screenshot({
    path: `test-results/${test.info().project.name}-fielder-detail.png`,
    scale: "css",
    style: ".bottom-nav { visibility: hidden !important; }",
  });
  await detail.getByRole("tab", { name: "成績", exact: true }).click();
  const previous = fielder.history.at(-1)!;
  for (const level of ["firstTeam", "farmTeam"] as const) {
    const stats = previous[level];
    const scope = detail.getByRole("region", {
      name: `${-previous.season}シーズン前の${level === "firstTeam" ? "1軍" : "2軍"}成績`,
      exact: true,
    });
    await metric(page, scope, "打率", battingAverage(stats.hits, stats.atBats));
    await metric(page, scope, "安打", stats.hits);
    await metric(page, scope, "本塁打", stats.homeRuns);
  }
  await detail.getByRole("tab", { name: "成長", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    detail.getByRole("tab", { name: "契約", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await detail.getByRole("button", { name: "選手一覧に戻る" }).click();
  const foreign = own.find((player) => player.isForeign)!;
  await page
    .getByRole("button", { name: `${foreign.name}の詳細`, exact: true })
    .click();
  await detail.getByRole("tab", { name: "契約", exact: true }).click();
  await metric(page, detail, "外国人選手", "はい");
});

test("再読み込みとセーブ切替で保存済みの選手を使い、自球団へ初期表示を戻す", async ({
  page,
}) => {
  const before = await setupSave(page);
  const first = before.players.find(
    (player) => player.teamId === "yokohama" && player.kind === "pitcher",
  )!;
  await menu(page, "選手");
  await expect(
    page.getByRole("button", { name: `${first.name}の詳細`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await menu(page, "選手");
  await expect(
    page.getByRole("button", { name: `${first.name}の詳細`, exact: true }),
  ).toBeVisible();
  await page.getByLabel("表示する球団").selectOption("tokyo");
  await menu(page, "ホーム");
  await page.getByRole("button", { name: "新しいスロットで始める" }).click();
  await page.getByRole("radio", { name: "札幌オーロラズ" }).check();
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toContainText("札幌オーロラズ");
  const newNames = await page.evaluate(async () => {
    const storagePath = "/src/storage/saves.ts";
    const viewPath = "/src/storage/playerViews.ts";
    const list = await (await import(storagePath)).readSaves();
    const view = await (await import(viewPath)).readPublicRoster(list.activeId);
    return view.players
      .filter(
        (player: { teamId: string; kind: string }) =>
          player.teamId === "sapporo" && player.kind === "pitcher",
      )
      .map((player: { name: string }) => player.name) as string[];
  });
  await menu(page, "選手");
  await expect(page.getByLabel("表示する球団")).toHaveValue("sapporo");
  await expect(
    page
      .getByRole("region", { name: "投手一覧", exact: true })
      .locator(".player-row-heading > strong"),
  ).toHaveText(newNames);
  await menu(page, "ホーム");
  await page
    .locator(".saves li")
    .filter({ hasText: "横浜セイラーズ" })
    .getByRole("button", { name: "読み込む", exact: true })
    .click();
  await menu(page, "選手");
  await expect(page.getByLabel("表示する球団")).toHaveValue("yokohama");
  await expect(
    page.getByRole("button", { name: `${first.name}の詳細`, exact: true }),
  ).toBeVisible();
});

test("セーブ未選択・読み込み失敗時は案内を表示し、破損データを変更しない", async ({
  page,
}) => {
  await page.goto("/");
  await menu(page, "選手");
  await expect(page.locator(".empty-players")).toContainText(
    "セーブを読み込むと",
  );
  await page.getByRole("button", { name: "ホームでセーブを選ぶ" }).click();
  await page.getByRole("radio", { name: "横浜セイラーズ" }).check();
  await page.getByRole("button", { name: "この球団で始める" }).click();
  await expect(
    page.getByRole("region", { name: "現在の操作球団" }),
  ).toBeVisible();
  const snapshot = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("fictional-pennant");
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<string>((resolve, reject) => {
      const tx = db.transaction(["settings", "worlds"], "readwrite");
      const active = tx.objectStore("settings").get("activeId");
      let data: string;
      active.onsuccess = () => {
        const r = tx.objectStore("worlds").get(active.result);
        r.onsuccess = () => {
          r.result.world.randomState = -1;
          data = JSON.stringify(r.result);
          tx.objectStore("worlds").put(r.result);
        };
      };
      tx.oncomplete = () => {
        db.close();
        resolve(data);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  });
  await menu(page, "選手");
  await expect(page.locator(".player-screen").getByRole("alert")).toContainText(
    "選手を読み込めませんでした",
  );
  await page
    .locator(".player-screen")
    .getByRole("button", { name: "再読み込み", exact: true })
    .click();
  await expect(page.locator(".player-screen").getByRole("alert")).toContainText(
    "破損",
  );
  const after = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("fictional-pennant");
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<string>((resolve) => {
      const tx = db.transaction(["settings", "worlds"], "readonly");
      const active = tx.objectStore("settings").get("activeId");
      let data: string;
      active.onsuccess = () => {
        const r = tx.objectStore("worlds").get(active.result);
        r.onsuccess = () => {
          data = JSON.stringify(r.result);
        };
      };
      tx.oncomplete = () => {
        db.close();
        resolve(data);
      };
    });
  });
  expect(after).toBe(snapshot);
});
