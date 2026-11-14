import { expect, test, type Page } from "@playwright/test";
import { setupSave } from "./helpers/player-fixture";
import type { PublicPlayer } from "../src/game/players/publicPlayer";
async function openPlayers(page: Page) {
  await page
    .getByRole("navigation", { name: "メインメニュー" })
    .getByRole("button", { name: "選手", exact: true })
    .click();
  await expect(page.getByLabel("表示する球団")).toHaveValue("own");
}
const rows = (page: Page) => page.locator(".player-row");
const count = (page: Page) =>
  page.getByRole("status", { name: "検索結果件数" });
const rowIds = (page: Page) =>
  rows(page).evaluateAll((elements) =>
    elements.map((e) => e.id.replace("player-row-", "")),
  );
async function snapshot(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const path = "/src/storage/saves.ts";
    return JSON.stringify(await (await import(path)).readGameSave(id));
  }, id);
}
function byId(a: PublicPlayer, b: PublicPlayer) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

test("912人の横断検索・部分一致・ページ追加・詳細からの位置復元と保存保護", async ({
  page,
}) => {
  const roster = await setupSave(page);
  const before = await snapshot(page, roster.saveId);
  await openPlayers(page);
  await expect(count(page)).toHaveText("検索結果 76人 / 表示 76人");
  await page.getByRole("button", { name: "全球団", exact: true }).click();
  await expect(count(page)).toHaveText("検索結果 912人 / 表示 80人");
  await expect(rows(page)).toHaveCount(80);
  await expect(page.locator(".player-card-team").first()).not.toBeEmpty();
  for (const scope of ["blue", "red"]) {
    await page.getByLabel("表示する球団").selectOption(scope);
    await expect(count(page)).toHaveText("検索結果 456人 / 表示 80人");
  }
  await page.getByLabel("表示する球団").selectOption("all");
  const sample = roster.players.find((p) => !p.isForeign)!;
  for (const part of sample.name.split(/\s/)) {
    await page.getByLabel("選手名で検索").fill(part);
    const expected = roster.players.filter((p) =>
      p.name.replace(/\s/g, "").includes(part),
    );
    await expect(count(page)).toHaveText(
      `検索結果 ${expected.length}人 / 表示 ${Math.min(80, expected.length)}人`,
    );
    await expect(
      page.getByRole("button", { name: `${sample.name}の詳細`, exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("選手名で検索").fill("");
  await page
    .getByRole("combobox", { name: "並べ替え", exact: true })
    .selectOption("age");
  await page
    .getByRole("combobox", { name: "並び順", exact: true })
    .selectOption("desc");
  const expected = [...roster.players].sort(
    (a, b) => b.age - a.age || byId(a, b),
  );
  expect(await rowIds(page)).toEqual(expected.slice(0, 80).map((p) => p.id));
  await page.getByRole("button", { name: /さらに表示/ }).click();
  await expect(rows(page)).toHaveCount(160);
  const target = expected[100];
  const card = page.getByRole("button", {
    name: `${target.name}の詳細`,
    exact: true,
  });
  await card.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  await card.click();
  await expect(
    page.getByRole("heading", { name: target.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "選手一覧に戻る" }).click();
  await expect(rows(page)).toHaveCount(160);
  await expect(page.getByLabel("表示する球団")).toHaveValue("all");
  await expect(
    page.getByRole("combobox", { name: "並び順", exact: true }),
  ).toHaveValue("desc");
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - y),
  ).toBeLessThan(5);
  await expect(card).toBeFocused();
  await page
    .locator(".query-summary")
    .evaluate((element) =>
      window.scrollTo(
        0,
        element.getBoundingClientRect().top + window.scrollY - 24,
      ),
    );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-player-search.png`,
    scale: "css",
  });
  while (await page.getByRole("button", { name: /さらに表示/ }).count()) {
    await page.getByRole("button", { name: /さらに表示/ }).click();
  }
  await expect(rows(page)).toHaveCount(912);
  expect(new Set(await rowIds(page))).toEqual(
    new Set(roster.players.map((p) => p.id)),
  );
  expect(await snapshot(page, roster.saveId)).toBe(before);
  await page.reload();
  await openPlayers(page);
  expect(await snapshot(page, roster.saveId)).toBe(before);
});

test("複合条件・数値境界・専用能力・空結果・解除をスマートフォンでも操作できる", async ({
  page,
}) => {
  const roster = await setupSave(page);
  await openPlayers(page);
  await page.getByRole("button", { name: "全球団", exact: true }).click();
  await page.getByText("詳細な絞り込み条件", { exact: true }).click();
  const sample = roster.players.find(
    (p) => p.kind === "pitcher" && p.isForeign,
  )!;
  if (sample.kind !== "pitcher") throw Error();
  await page
    .getByRole("combobox", { name: "投手・野手", exact: true })
    .selectOption("pitcher");
  await page
    .getByRole("combobox", { name: "登録区分", exact: true })
    .selectOption(sample.registration);
  await page
    .getByRole("combobox", { name: "主守備位置", exact: true })
    .selectOption("P");
  await page
    .getByRole("combobox", { name: "投げ方", exact: true })
    .selectOption(sample.throws);
  await page
    .getByRole("combobox", { name: "打ち方", exact: true })
    .selectOption(sample.bats);
  await page
    .getByRole("combobox", { name: "外国人区分", exact: true })
    .selectOption("foreign");
  await page.getByLabel("年齢の下限", { exact: true }).fill(String(sample.age));
  await page.getByLabel("年齢の上限", { exact: true }).fill(String(sample.age));
  await page
    .getByRole("combobox", { name: "能力条件", exact: true })
    .selectOption("pitcher.velocityKmh");
  await page
    .getByLabel("能力値の下限", { exact: true })
    .fill(String(sample.abilities.velocityKmh));
  await page
    .getByLabel("能力値の上限", { exact: true })
    .fill(String(sample.abilities.velocityKmh));
  const expected = roster.players
    .filter(
      (p) =>
        p.kind === "pitcher" &&
        p.registration === sample.registration &&
        p.throws === sample.throws &&
        p.bats === sample.bats &&
        p.isForeign &&
        p.age === sample.age &&
        p.abilities.velocityKmh === sample.abilities.velocityKmh,
    )
    .sort(byId);
  expect(await rowIds(page)).toEqual(expected.map((p) => p.id));
  await expect(page.locator(".comparison-value").first()).toContainText(
    `${sample.abilities.velocityKmh}km/h`,
  );
  await page
    .getByRole("button", { name: `${sample.name}の詳細`, exact: true })
    .click();
  await page.getByRole("button", { name: "選手一覧に戻る" }).click();
  await expect(page.locator(".advanced-search")).toHaveAttribute("open", "");
  await expect(page.getByLabel("能力値の下限", { exact: true })).toHaveValue(
    String(sample.abilities.velocityKmh),
  );
  await page
    .getByRole("combobox", { name: "投手・野手", exact: true })
    .selectOption("fielder");
  await expect(
    page.getByText("条件に一致する選手はいません", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "条件をすべて解除" }).click();
  await expect(page.getByLabel("表示する球団")).toHaveValue("own");
  await expect(count(page)).toHaveText("検索結果 76人 / 表示 76人");
  await page
    .getByRole("combobox", { name: "能力条件", exact: true })
    .selectOption("fielder.power");
  await page.getByLabel("能力値の下限", { exact: true }).fill("101");
  await expect(page.getByRole("alert")).toContainText("0〜100");
  await expect(rows(page)).toHaveCount(0);
  await page.getByLabel("能力値の下限", { exact: true }).fill("80");
  await page.getByLabel("能力値の上限", { exact: true }).fill("70");
  await expect(page.getByRole("alert")).toContainText("下限は上限以下");
  await page.getByRole("button", { name: "条件をすべて解除" }).click();
  await page.getByRole("button", { name: "全球団", exact: true }).click();
  await page
    .getByRole("combobox", { name: "並べ替え", exact: true })
    .selectOption("position.C");
  await page
    .getByRole("combobox", { name: "並び順", exact: true })
    .selectOption("desc");
  const fielders = roster.players
    .filter((p) => p.kind === "fielder")
    .sort(
      (a, b) =>
        (b.kind === "fielder" ? b.positionAptitudes.C : 0) -
          (a.kind === "fielder" ? a.positionAptitudes.C : 0) || byId(a, b),
    );
  expect(await rowIds(page)).toEqual(fielders.slice(0, 80).map((p) => p.id));
  await expect(count(page)).toHaveText("検索結果 456人 / 表示 80人");
  expect(await page.locator(".player-screen").textContent()).not.toMatch(
    /developmentByPlayerId|growthType|abilityCaps|潜在上限|成長タイプ|OVR/,
  );
  const options = await page
    .locator(".player-search-controls option")
    .evaluateAll((elements) =>
      elements.map((e) => (e as HTMLOptionElement).value),
    );
  expect(options.join(" ")).not.toMatch(
    /developmentByPlayerId|growthType|abilityCaps/,
  );
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
