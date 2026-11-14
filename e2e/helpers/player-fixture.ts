import { expect, type Page } from "@playwright/test";
import type { PublicRoster } from "../../src/storage/playerViews";
export async function setupSave(page: Page): Promise<PublicRoster> {
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
