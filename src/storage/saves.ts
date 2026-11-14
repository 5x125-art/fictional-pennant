import { getTeam, teams } from "../data/teams";
import { generateInitialPlayerWorld } from "../game/players/generate";
import { playerPreview, type PlayerPreview } from "../game/players/preview";
import { validatePlayerWorld } from "../game/players/validate";
import { createSaveId } from "../game/saveId";
import {
  createSave,
  migrationSeed,
  SaveDataError,
  toMetadata,
  toSummary,
  validateSave,
  validateSummary,
  type GameSave,
  type PendingGame,
  type SaveSummary,
  type SaveMetadata,
} from "../game/save";

const DB_NAME = "fictional-pennant";
const allStores = ["saves", "settings", "worlds", "drafts"];
export interface DraftView {
  readonly id: string;
  readonly selectedTeamId: string | null;
  readonly players: readonly PlayerPreview[];
}
export interface SaveList {
  saves: SaveSummary[];
  activeId: string | null;
  issues: string[];
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("saves"))
        db.createObjectStore("saves", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings"))
        db.createObjectStore("settings");
      // v1のレコードはここでは移行・削除しない。
      if (!db.objectStoreNames.contains("worlds"))
        db.createObjectStore("worlds", { keyPath: "id" });
      if (!db.objectStoreNames.contains("drafts"))
        db.createObjectStore("drafts", { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(
        new SaveDataError("別のタブを閉じて、もう一度読み込んでください。"),
      );
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
type Guard = (fn: () => void) => () => void;
/** 非同期のawaitをトランザクション内に挟まず、完了イベントでのみ成功を返す。 */
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void, guard: Guard) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let result: T;
    let failure: unknown;
    const guard: Guard = (fn) => () => {
      try {
        fn();
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(
        failure ??
          tx.error ??
          new SaveDataError(
            "保存処理が中断されました。変更は反映されていません。",
          ),
      );
    };
    guard(() =>
      run(
        tx,
        (value) => {
          result = value;
        },
        guard,
      ),
    )();
  });
}

export async function readSaves(): Promise<SaveList> {
  // worlds/draftsストアには触れない。混在するv1/v2メタデータのみを読む。
  return transaction(["saves", "settings"], "readonly", (tx, result, guard) => {
    const saves = tx.objectStore("saves").getAll();
    const active = tx.objectStore("settings").get("activeId");
    const list: SaveList = { saves: [], activeId: null, issues: [] };
    saves.onsuccess = guard(() => {
      for (const item of saves.result) {
        try {
          list.saves.push(toSummary(validateSummary(item)));
        } catch (error) {
          list.issues.push(
            error instanceof SaveDataError
              ? error.message
              : "読み込めないスロットがあります。データは変更していません。",
          );
        }
      }
      list.saves.sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
      result(list);
    });
    active.onsuccess = guard(() => {
      list.activeId = typeof active.result === "string" ? active.result : null;
      result(list);
    });
  });
}
function validateDraft(value: unknown): PendingGame {
  if (!value || typeof value !== "object")
    throw new SaveDataError(
      "新規ゲームの準備データがありません。再読み込みしてください。",
    );
  const draft = value as PendingGame;
  if (
    draft.key !== "pending" ||
    typeof draft.id !== "string" ||
    !draft.id ||
    draft.world?.phase !== "awaitingClubSelection"
  )
    throw new SaveDataError(
      "新規ゲームの準備データが破損しています。データは変更していません。",
    );
  if (draft.selectedTeamId !== null) getTeam(draft.selectedTeamId);
  validatePlayerWorld(draft.world);
  if (draft.world.players.length !== 912)
    throw new SaveDataError(
      "新規ゲームの選手データが不足しています。データは変更していません。",
    );
  for (const team of teams) {
    const roster = draft.world.players.filter(
      (player) => player.teamId === team.id,
    );
    if (
      roster.filter((player) => player.registration === "senior").length !==
        68 ||
      roster.filter((player) => player.registration === "development")
        .length !== 8
    )
      throw new SaveDataError(
        "新規ゲームの球団別人数が不正です。データは変更していません。",
      );
  }
  return draft;
}
function draftView(draft: PendingGame): DraftView {
  return {
    id: draft.id,
    selectedTeamId: draft.selectedTeamId,
    players: draft.world.players.map(playerPreview),
  };
}
export async function readPendingGame(): Promise<DraftView | null> {
  return transaction(["drafts"], "readonly", (tx, result, guard) => {
    const request = tx.objectStore("drafts").get("pending");
    request.onsuccess = guard(() =>
      result(
        request.result === undefined
          ? null
          : draftView(validateDraft(request.result)),
      ),
    );
  });
}
/** 同時タブ・StrictModeでも既存の準備データを再利用。キャンセルでも削除しない。 */
export async function prepareNewGame(): Promise<DraftView> {
  return transaction(["drafts", "saves"], "readwrite", (tx, result, guard) => {
    const request = tx.objectStore("drafts").get("pending");
    request.onsuccess = guard(() => {
      if (request.result !== undefined) {
        result(draftView(validateDraft(request.result)));
        return;
      }
      const metadata = tx.objectStore("saves").getAll();
      metadata.onsuccess = guard(() => {
        const used = new Set<number>();
        for (const item of metadata.result) {
          try {
            const save = validateSummary(item);
            used.add(
              save.schemaVersion === 1
                ? migrationSeed(save.id)
                : save.initialSeed!,
            );
          } catch {
            /* 壊れたスロットは変更しない */
          }
        }
        let seed = crypto.getRandomValues(new Uint32Array(1))[0];
        while (used.has(seed)) seed = (seed + 1) >>> 0;
        const draft: PendingGame = {
          key: "pending",
          id: createSaveId(),
          selectedTeamId: null,
          world: generateInitialPlayerWorld(seed),
        };
        tx.objectStore("drafts").add(draft);
        result(draftView(draft));
      });
    });
  });
}
export async function selectDraftTeam(
  id: string,
  teamId: string,
): Promise<void> {
  getTeam(teamId);
  return transaction(["drafts"], "readwrite", (tx, _result, guard) => {
    const request = tx.objectStore("drafts").get("pending");
    request.onsuccess = guard(() => {
      const draft = validateDraft(request.result);
      if (draft.id !== id)
        throw new SaveDataError(
          "準備中のゲームが別のタブで変更されました。再読み込みしてください。",
        );
      tx.objectStore("drafts").put({ ...draft, selectedTeamId: teamId });
    });
  });
}
export async function newSave(teamId: string, draftId: string): Promise<void> {
  getTeam(teamId);
  return transaction(allStores, "readwrite", (tx, _result, guard) => {
    const request = tx.objectStore("drafts").get("pending");
    request.onsuccess = guard(() => {
      const draft = validateDraft(request.result);
      if (draft.id !== draftId || draft.selectedTeamId !== teamId)
        throw new SaveDataError(
          "球団選択が変更されています。選択内容を確認してください。",
        );
      const save = createSave(teamId, draft);
      tx.objectStore("saves").add(toMetadata(save));
      tx.objectStore("worlds").add({ id: save.id, world: save.world });
      tx.objectStore("settings").put(save.id, "activeId");
      tx.objectStore("drafts").delete("pending");
    });
  });
}
function withSave(
  tx: IDBTransaction,
  id: string,
  guard: Guard,
  migrate: boolean,
  done: (save: GameSave) => void,
) {
  const request = tx.objectStore("saves").get(id);
  request.onsuccess = guard(() => {
    const metadata = validateSummary(request.result);
    if (metadata.id !== id)
      throw new SaveDataError("スロットIDが一致しません。");
    if (metadata.schemaVersion === 1) {
      if (!migrate)
        throw new SaveDataError("旧セーブは読み込み操作で移行してください。");
      const { phase: _phase, ...world } = generateInitialPlayerWorld(
        migrationSeed(id),
      );
      const save: GameSave = {
        ...toSummary(metadata),
        schemaVersion: 2,
        world,
      };
      validateSave(save);
      tx.objectStore("worlds").add({ id, world });
      tx.objectStore("saves").put(toMetadata(save));
      done(save);
    } else {
      const request = tx.objectStore("worlds").get(id);
      request.onsuccess = guard(() => {
        const record = request.result;
        if (
          !record ||
          record.id !== id ||
          record.world?.seed !== metadata.initialSeed
        )
          throw new SaveDataError(
            "選手データとスロット情報が一致しません。データは変更していません。",
          );
        done(validateSave({ ...toSummary(metadata), world: record.world }));
      });
    }
  });
}
/** ゲーム処理用の本体読み込み。UIはこのAPIを使わず表示用DTOだけ受け取る。 */
export async function readGameSave(id: string): Promise<GameSave> {
  return transaction(["saves", "worlds"], "readonly", (tx, result, guard) =>
    withSave(tx, id, guard, false, result),
  );
}
export async function loadSave(id: string): Promise<void> {
  return transaction(
    ["saves", "worlds", "settings"],
    "readwrite",
    (tx, _result, guard) => {
      withSave(tx, id, guard, true, () =>
        tx.objectStore("settings").put(id, "activeId"),
      );
    },
  );
}
export async function saveCurrent(id: string): Promise<void> {
  return transaction(["saves", "worlds"], "readwrite", (tx, _result, guard) => {
    withSave(tx, id, guard, true, (save) => {
      // DBの正式状態を読み、日時だけ変更。メモリ上の古い世界で上書きしない。
      tx.objectStore("saves").put(
        toMetadata({ ...save, updatedAt: new Date().toISOString() }),
      );
    });
  });
}
