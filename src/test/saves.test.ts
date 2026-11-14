import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTeam, leagues, teams } from "../data/teams";
import { initializeSession } from "../storage/session";
import * as generation from "../game/players/generate";
import {
  migrationSeed,
  validateSave,
  validateSummary,
  type PendingGame,
  type PlayerWorldState,
} from "../game/save";
import {
  loadSave,
  newSave,
  prepareNewGame,
  readGameSave,
  readPendingGame,
  readSaves,
  saveCurrent,
  selectDraftTeam,
} from "../storage/saves";
const dbName = "fictional-pennant";
const legacy = {
  schemaVersion: 1,
  id: "legacy-slot",
  teamId: "kobe",
  createdAt: "2026-11-14T00:00:00.000Z",
  updatedAt: "2026-11-14T01:00:00.000Z",
};
async function raw<T = unknown>(store: string, key: IDBValidKey): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction([store], "readonly");
      const r = tx.objectStore(store).get(key);
      tx.oncomplete = () => {
        db.close();
        resolve(r.result as T);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
}
async function put(store: string, value: unknown, key?: IDBValidKey) {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("saves", { keyPath: "id" });
      open.result.createObjectStore("settings");
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction([store], "readwrite");
      if (key === undefined) tx.objectStore(store).put(value);
      else tx.objectStore(store).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
}
async function start(teamId = "sapporo") {
  const draft = await prepareNewGame();
  await selectDraftTeam(draft.id, teamId);
  await newSave(teamId, draft.id);
  return draft.id;
}
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("球団・セーブ回帰", () => {
  it("各リーグ6球団、識別子とカラーは12球団で一意", () => {
    expect(teams).toHaveLength(12);
    for (const league of leagues)
      expect(teams.filter((team) => team.league === league.id)).toHaveLength(6);
    expect(new Set(teams.map((team) => team.id)).size).toBe(12);
    expect(new Set(teams.map((team) => team.color)).size).toBe(12);
    expect(getTeam("matsuyama").name).toBe("松山シトラス");
  });
  it("空のDBは一覧だけ読み、選手を生成しない", async () => {
    const spy = vi.spyOn(generation, "generateInitialPlayerWorld");
    expect(await readSaves()).toEqual({
      saves: [],
      activeId: null,
      issues: [],
    });
    expect(spy).not.toHaveBeenCalled();
  });
  it("存在しないスロットや不正な球団を拒否し、現在の選択・データを保持する", async () => {
    const id = await start("kobe");
    const before = await readGameSave(id);
    const list = await readSaves();
    await expect(loadSave("missing")).rejects.toThrow();
    await expect(saveCurrent("missing")).rejects.toThrow();
    await expect(newSave("unknown", "missing")).rejects.toThrow();
    expect(await readSaves()).toEqual(list);
    expect(await readGameSave(id)).toEqual(before);
    expect(() =>
      validateSummary({ ...legacy, updatedAt: "invalid" }),
    ).toThrow();
  });
});

describe("準備世界とschemaVersion 2", () => {
  it("同時準備でも1回だけ生成し、球団変更・接続再開後も世界全体と非公開情報を保持する", async () => {
    const spy = vi.spyOn(generation, "generateInitialPlayerWorld");
    const [a, b] = await Promise.all([prepareNewGame(), prepareNewGame()]);
    expect(a).toEqual(b);
    expect(spy).toHaveBeenCalledOnce();
    const before = await raw<PendingGame>("drafts", "pending");
    await selectDraftTeam(a.id, "tokyo");
    await selectDraftTeam(a.id, "niigata");
    const resumed = await prepareNewGame();
    expect(resumed.selectedTeamId).toBe("niigata");
    expect(resumed.players).toEqual(a.players);
    expect((await raw<PendingGame>("drafts", "pending")).world).toEqual(
      before.world,
    );
    await newSave("niigata", a.id);
    const saved = await readGameSave(a.id);
    const { phase, ...world } = before.world;
    expect(saved).toMatchObject({
      schemaVersion: 2,
      id: a.id,
      teamId: "niigata",
    });
    expect(saved.world).toEqual(world);
    expect(saved.world.players).toHaveLength(912);
    for (const team of teams)
      expect(
        saved.world.players.filter((player) => player.teamId === team.id),
      ).toHaveLength(76);
    expect(Object.keys(saved.world.developmentByPlayerId)).toHaveLength(912);
    expect(await readPendingGame()).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    expect(await readGameSave(a.id)).toEqual(saved);
  });
  it("プレビューは公開情報だけをホワイトリストで返す", async () => {
    const view = await prepareNewGame();
    expect(view.players).toHaveLength(912);
    expect(view.players[0].currentAbilities).toContain("ミート");
    expect(view.players[0].currentAbilities).toMatch(/\d+（[SABCDEFG]）/);
    expect(
      view.players.find((player) => player.position === "P")!.currentAbilities,
    ).toMatch(/球速 \d+km\/h \/ 制球 \d+（[SABCDEFG]）/);
    expect(JSON.stringify(view)).not.toMatch(
      /developmentByPlayerId|growthType|abilityCaps|randomState|history/,
    );
    expect(Object.keys(view).sort()).toEqual([
      "id",
      "players",
      "selectedTeamId",
    ]);
  });
  it("手動保存・読み込みは生成せず、保存済みの変更後の正式状態を保つ", async () => {
    const id = await start();
    const record = await raw<{ id: string; world: PlayerWorldState }>(
      "worlds",
      id,
    );
    const changed = structuredClone(record);
    const player = changed.world.players[0];
    if (player.kind !== "fielder") throw new Error("野手が必要");
    Object.assign(player.abilities, {
      power: Math.max(0, player.abilities.power - 1),
    });
    Object.assign(player.contract, { years: 2 });
    // 引退や入団によって初期人数が変化しても、再生成せず保存状態を使う構造。
    const retired = changed.world.players.at(-1)!;
    (changed.world.players as unknown[]).pop();
    delete (changed.world.developmentByPlayerId as Record<string, unknown>)[
      retired.id
    ];
    await put("worlds", changed);
    const spy = vi.spyOn(generation, "generateInitialPlayerWorld");
    const before = await readGameSave(id);
    await saveCurrent(id);
    await loadSave(id);
    const after = await readGameSave(id);
    expect(after.world).toEqual(before.world);
    expect(after.world).toEqual(changed.world);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.teamId).toBe(before.teamId);
    expect(spy).not.toHaveBeenCalled();
  });
  it("別スロットは異なるシード・世界になり、切替時にデータが混ざらない", async () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        (array as Uint32Array).fill(42);
        return array;
      },
    );
    const firstId = await start("sapporo");
    const first = await readGameSave(firstId);
    const secondId = await start("tokyo");
    const second = await readGameSave(secondId);
    expect(firstId).not.toBe(secondId);
    expect(first.world.seed).not.toBe(second.world.seed);
    expect(first.world.players).not.toEqual(second.world.players);
    await loadSave(firstId);
    await saveCurrent(firstId);
    expect((await readSaves()).activeId).toBe(firstId);
    expect((await readGameSave(firstId)).world).toEqual(first.world);
    await loadSave(secondId);
    expect(await readGameSave(secondId)).toEqual(second);
    expect((await readSaves()).saves).toHaveLength(2);
  });
  it("一覧には本体・準備データを読まず、必要なメタデータだけを返す", async () => {
    await start();
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction");
    const list = await readSaves();
    expect(list.saves).toHaveLength(1);
    expect(
      spy.mock.calls.every(
        ([stores]) =>
          JSON.stringify(stores) === JSON.stringify(["saves", "settings"]),
      ),
    ).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/players|developmentByPlayerId/);
  });
  it("別タブで確定済みの準備ID・球団変更を拒否し、既存スロットを上書きしない", async () => {
    const draft = await prepareNewGame();
    await selectDraftTeam(draft.id, "kobe");
    await expect(newSave("sapporo", draft.id)).rejects.toThrow();
    expect(await readPendingGame()).not.toBeNull();
    await newSave("kobe", draft.id);
    const before = await readGameSave(draft.id);
    await expect(newSave("kobe", draft.id)).rejects.toThrow();
    expect(await readGameSave(draft.id)).toEqual(before);
  });
});

describe("旧形式移行と失敗時の保護", () => {
  it("DB v1を壊さず開き、一覧表示では移行せず選択スロットだけを原子的に移行する", async () => {
    await put("saves", legacy);
    await put("saves", { ...legacy, id: "other-slot", teamId: "tokyo" });
    await put("settings", legacy.id, "activeId");
    const spy = vi.spyOn(generation, "generateInitialPlayerWorld");
    expect((await readSaves()).saves.map((save) => save.schemaVersion)).toEqual(
      [1, 1],
    );
    expect(spy).not.toHaveBeenCalled();
    await loadSave(legacy.id);
    const migrated = await readGameSave(legacy.id);
    expect(migrated).toMatchObject({ ...legacy, schemaVersion: 2 });
    expect(migrated.world.seed).toBe(migrationSeed(legacy.id));
    expect(migrated.world.players).toHaveLength(912);
    expect(
      (await raw<{ schemaVersion: number }>("saves", "other-slot"))
        .schemaVersion,
    ).toBe(1);
    expect(
      (await readSaves()).saves.map((save) => save.schemaVersion).sort(),
    ).toEqual([1, 2]);
    await loadSave(legacy.id);
    expect(await readGameSave(legacy.id)).toEqual(migrated);
    expect(spy).toHaveBeenCalledOnce();
  });
  it.each(["worlds", "settings"])(
    "%sへの保存失敗時は旧メタデータ・現在スロット・本体をロールバックする",
    async (store) => {
      await put("saves", legacy);
      await put("settings", "previous", "activeId");
      await readSaves();
      const original =
        store === "worlds"
          ? IDBObjectStore.prototype.add
          : IDBObjectStore.prototype.put;
      const spy = vi
        .spyOn(IDBObjectStore.prototype, store === "worlds" ? "add" : "put")
        .mockImplementation(function (
          this: IDBObjectStore,
          value: unknown,
          key?: IDBValidKey,
        ) {
          if (this.name === store)
            throw new DOMException("full", "QuotaExceededError");
          return key === undefined
            ? original.call(this, value)
            : original.call(this, value, key);
        });
      await expect(loadSave(legacy.id)).rejects.toMatchObject({
        name: "QuotaExceededError",
      });
      spy.mockRestore();
      expect(await raw("saves", legacy.id)).toEqual(legacy);
      expect(await raw("worlds", legacy.id)).toBeUndefined();
      expect(await raw("settings", "activeId")).toBe("previous");
      await loadSave(legacy.id);
      expect((await readGameSave(legacy.id)).world.seed).toBe(
        migrationSeed(legacy.id),
      );
    },
  );
  it("生成自体の失敗でも旧データを保持する", async () => {
    await put("saves", legacy);
    vi.spyOn(generation, "generateInitialPlayerWorld").mockImplementation(
      () => {
        throw new Error("generation failed");
      },
    );
    await expect(loadSave(legacy.id)).rejects.toThrow("generation failed");
    expect(await raw("saves", legacy.id)).toEqual(legacy);
  });
  it("新規確定失敗時は準備世界を保持し、成功扱い・半端なスロットを作らない", async () => {
    const draft = await prepareNewGame();
    await selectDraftTeam(draft.id, "kobe");
    const before = await raw("drafts", "pending");
    const original = IDBObjectStore.prototype.add;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === "worlds")
          throw new DOMException("full", "QuotaExceededError");
        return key === undefined
          ? original.call(this, value)
          : original.call(this, value, key);
      });
    await expect(newSave("kobe", draft.id)).rejects.toThrow();
    spy.mockRestore();
    expect(await raw("drafts", "pending")).toEqual(before);
    expect((await readSaves()).saves).toHaveLength(0);
    expect(await raw("worlds", draft.id)).toBeUndefined();
    await newSave("kobe", draft.id);
    expect((await readGameSave(draft.id)).world.players).toHaveLength(912);
  });
  it("未対応形式・破損した本体を上書きせず、正常スロットを一覧表示できる", async () => {
    await put("saves", { ...legacy, id: "future", schemaVersion: 99 });
    const id = await start();
    const before = await readGameSave(id);
    expect((await readSaves()).issues).toHaveLength(1);
    expect((await readSaves()).saves).toHaveLength(1);
    await expect(loadSave("future")).rejects.toThrow("未対応");
    const corrupt = { id, world: { ...before.world, randomState: -1 } };
    await put("worlds", corrupt);
    await expect(loadSave(id)).rejects.toThrow("破損");
    await expect(saveCurrent(id)).rejects.toThrow();
    expect(await raw("worlds", id)).toEqual(corrupt);
    expect(
      (await raw<{ schemaVersion: number }>("saves", "future")).schemaVersion,
    ).toBe(99);
    expect(() =>
      validateSave({
        ...before,
        world: { ...before.world, developmentByPlayerId: {} },
      }),
    ).toThrow();
  });
});

it("非同期の制約違反でも移行トランザクション全体をロールバックする", async () => {
  await put("saves", legacy);
  await put("settings", "previous", "activeId");
  await readSaves();
  const orphan = { id: legacy.id, world: { marker: "保護対象の既存レコード" } };
  await put("worlds", orphan);
  await expect(loadSave(legacy.id)).rejects.toMatchObject({
    name: "ConstraintError",
  });
  expect(await raw("saves", legacy.id)).toEqual(legacy);
  expect(await raw("worlds", legacy.id)).toEqual(orphan);
  expect(await raw("settings", "activeId")).toBe("previous");
});

it("準備中データが破損しても再生成や上書きをせずエラーにする", async () => {
  await prepareNewGame();
  const draft = await raw<PendingGame>("drafts", "pending");
  const corrupt = { ...draft, world: { ...draft.world, players: [] } };
  await put("drafts", corrupt);
  await expect(prepareNewGame()).rejects.toThrow();
  await expect(selectDraftTeam(draft.id, "sapporo")).rejects.toThrow();
  expect(await raw("drafts", "pending")).toEqual(corrupt);
});

it("選手本体の能力・ID・成長情報・履歴の破損を拒否する", async () => {
  const id = await start();
  const save = await readGameSave(id);
  const changes = [
    (world: any) => {
      world.players[0].abilities.power = -1;
    },
    (world: any) => {
      world.players[1].id = world.players[0].id;
    },
    (world: any) => {
      world.developmentByPlayerId[world.players[0].id].growthType = "unknown";
    },
    (world: any) => {
      world.players.find(
        (player: any) => player.history.length,
      ).history[0].firstTeam.hits = -1;
    },
    (world: any) => {
      world.players[0].contract.years = 6;
    },
  ];
  for (const change of changes) {
    const world = structuredClone(save.world);
    change(world);
    expect(() => validateSave({ ...save, world })).toThrow("破損");
  }
});

it("旧スロットIDのシード導出は固定したFNV-1aで再現する", () => {
  expect(migrationSeed("hello")).toBe(0x4f9f2cab);
  expect(migrationSeed("legacy-slot")).toBe(migrationSeed("legacy-slot"));
  expect(migrationSeed("legacy-slot")).not.toBe(migrationSeed("other-slot"));
});

describe("破損・未対応スロットがある場合の起動", () => {
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
      label: "アクティブ旧セーブが破損",
      schema: 1,
      active: true,
      healthy: false,
    },
    {
      label: "正常なアクティブスロットと未対応セーブの混在",
      schema: 99,
      active: false,
      healthy: true,
      activeHealthy: true,
    },
  ];
  it.each(cases)(
    "$label: 警告しながら別スロットを作成でき、元データを変更しない",
    async (scenario) => {
      const bad = {
        ...legacy,
        id: "bad",
        schemaVersion: scenario.schema,
        updatedAt: scenario.schema === 1 ? "broken-date" : legacy.updatedAt,
        ...(scenario.schema === 2 ? { initialSeed: 42 } : {}),
        marker: "元データを保護",
      };
      await put("saves", bad);
      if (scenario.healthy) await put("saves", { ...legacy, id: "healthy" });
      const activeId = scenario.activeHealthy
        ? "healthy"
        : scenario.active
          ? "bad"
          : null;
      if (activeId) await put("settings", activeId, "activeId");
      await readSaves();
      const badBody = {
        id: "bad",
        world: {
          generationVersion: 1,
          seed: 42,
          randomState: -1,
          players: [],
          developmentByPlayerId: {},
        },
      };
      if (scenario.schema === 2) await put("worlds", badBody);
      const spy = vi.spyOn(generation, "generateInitialPlayerWorld");
      const session = await initializeSession();
      expect(session.issues.length).toBeGreaterThan(0);
      expect(session.activeId).toBe(scenario.activeHealthy ? "healthy" : null);
      expect(session.saves.some((save) => save.id === "healthy")).toBe(
        scenario.healthy,
      );
      // 生成されるのは新規準備世界、または正常な旧アクティブの移行だけ。
      expect(spy).toHaveBeenCalledOnce();
      expect(await raw("saves", "bad")).toEqual(bad);
      expect(await raw("worlds", "bad")).toEqual(
        scenario.schema === 2 ? badBody : undefined,
      );
      if (scenario.active)
        expect(await raw("settings", "activeId")).toBe("bad");
      let healthyWorld;
      if (scenario.healthy) {
        await loadSave("healthy");
        healthyWorld = await readGameSave("healthy");
        expect(healthyWorld.teamId).toBe("kobe");
      }
      const draft = session.draft ?? (await prepareNewGame());
      expect(draft.id).not.toBe("bad");
      await selectDraftTeam(draft.id, "sapporo");
      await newSave("sapporo", draft.id);
      expect((await readGameSave(draft.id)).world.players).toHaveLength(912);
      expect(await raw("saves", "bad")).toEqual(bad);
      expect(await raw("worlds", "bad")).toEqual(
        scenario.schema === 2 ? badBody : undefined,
      );
      if (healthyWorld)
        expect(await readGameSave("healthy")).toEqual(healthyWorld);
    },
  );
});
