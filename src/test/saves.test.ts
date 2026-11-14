import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getTeam, leagues, teams } from "../data/teams";
import { generateInitialPlayerWorld } from "../game/players/generate";
import { createSave, validateSave } from "../game/save";
import { loadSave, newSave, readSaves, saveCurrent } from "../storage/saves";
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("fictional-pennant");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});
describe("球団・セーブ", () => {
  it("各リーグ6球団、識別子とカラーは12球団で一意", () => {
    expect(teams).toHaveLength(12);
    for (const league of leagues)
      expect(teams.filter((team) => team.league === league.id)).toHaveLength(6);
    expect(new Set(teams.map((team) => team.id)).size).toBe(12);
    expect(new Set(teams.map((team) => team.color)).size).toBe(12);
    expect(getTeam("matsuyama").name).toBe("松山シトラス");
  });
  it("未知の球団・未対応形式を拒否する", () => {
    expect(() => createSave("unknown")).toThrow();
    expect(() =>
      validateSave({ ...createSave("sapporo"), schemaVersion: 2 }),
    ).toThrow();
    expect(() =>
      validateSave({ ...createSave("sapporo"), updatedAt: "invalid" }),
    ).toThrow();
  });
  it("空のデータベースを読み込める", async () => {
    expect(await readSaves()).toEqual({ saves: [], activeId: null });
  });
  it("複数スロットを上書きせず作成し、接続を開き直して操作球団を復元する", async () => {
    await newSave("sapporo");
    const first = (await readSaves()).saves[0];
    await newSave("tokyo");
    const second = await readSaves();
    expect(second.saves).toHaveLength(2);
    expect(
      second.saves.find((save) => save.id === second.activeId)?.teamId,
    ).toBe("tokyo");
    await loadSave(first.id);
    expect((await readSaves()).activeId).toBe(first.id);
    await saveCurrent(first.id);
    const saved = (await readSaves()).saves.find(
      (save) => save.id === first.id,
    )!;
    expect(saved.teamId).toBe("sapporo");
    expect(saved.createdAt).toBe(first.createdAt);
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.updatedAt),
    );
    expect((await readSaves()).saves).toHaveLength(2);
  });
  it("存在しないスロットの読み込み・保存失敗時に既存セーブと選択を維持する", async () => {
    await newSave("kobe");
    const before = await readSaves();
    await expect(loadSave("missing")).rejects.toThrow();
    await expect(saveCurrent("missing")).rejects.toThrow();
    expect(await readSaves()).toEqual(before);
  });
});

it("既存schemaVersion 1セーブを生成処理が変更せず、その後も保存・読み込みできる", async () => {
  // Phase 1形式の既存データを直接登録し、生成との非結合を検証する。
  await readSaves();
  const legacy = {
    schemaVersion: 1,
    id: "legacy-slot",
    teamId: "kobe",
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
  };
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fictional-pennant", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      expect(db.version).toBe(1);
      expect(Array.from(db.objectStoreNames)).toEqual(["saves", "settings"]);
      const tx = db.transaction(["saves", "settings"], "readwrite");
      tx.objectStore("saves").put(legacy);
      tx.objectStore("settings").put(legacy.id, "activeId");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
  generateInitialPlayerWorld(7);
  expect(await readSaves()).toEqual({ saves: [legacy], activeId: legacy.id });
  await newSave("sapporo");
  expect((await readSaves()).saves).toHaveLength(2);
  await loadSave(legacy.id);
  await saveCurrent(legacy.id);
  const after = await readSaves();
  expect(after.activeId).toBe(legacy.id);
  expect(after.saves.find((save) => save.id === legacy.id)).toMatchObject({
    schemaVersion: 1,
    teamId: "kobe",
    createdAt: legacy.createdAt,
  });
});
