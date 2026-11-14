import { createSave, validateSave, type GameSave } from "../game/save";
const DB_NAME = "fictional-pennant";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("saves", { keyPath: "id" });
      request.result.createObjectStore("settings");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("別のタブを閉じて、もう一度読み込んでください。"));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, setResult: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["saves", "settings"], mode);
    let result: T;
    let failure: unknown;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error("保存を完了できませんでした。"));
    };
    tx.onerror = () => {
      /* onabortで失敗を通知する */
    };
    try {
      run(tx, (value) => {
        result = value;
      });
    } catch (error) {
      failure = error;
      tx.abort();
    }
  });
}
export async function readSaves(): Promise<{
  saves: GameSave[];
  activeId: string | null;
}> {
  const raw = await transaction<{ saves: unknown[]; activeId: unknown }>(
    "readonly",
    (tx, set) => {
      const saves = tx.objectStore("saves").getAll();
      const active = tx.objectStore("settings").get("activeId");
      let result: { saves: unknown[]; activeId: unknown } = {
        saves: [],
        activeId: null,
      };
      saves.onsuccess = () => {
        result = { ...result, saves: saves.result };
        set(result);
      };
      active.onsuccess = () => {
        result = { ...result, activeId: active.result };
        set(result);
      };
    },
  );
  const saves = raw.saves
    .map(validateSave)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const activeId =
    typeof raw.activeId === "string" &&
    saves.some((save) => save.id === raw.activeId)
      ? raw.activeId
      : null;
  return { saves, activeId };
}
export async function newSave(teamId: string): Promise<void> {
  const save = createSave(teamId);
  await transaction<void>("readwrite", (tx) => {
    tx.objectStore("saves").add(save);
    tx.objectStore("settings").put(save.id, "activeId");
  });
}
export async function loadSave(id: string): Promise<void> {
  await transaction<void>("readwrite", (tx) => {
    const request = tx.objectStore("saves").get(id);
    request.onsuccess = () => {
      try {
        validateSave(request.result);
        tx.objectStore("settings").put(id, "activeId");
      } catch {
        tx.abort();
      }
    };
  });
}
// 球団IDを引数に取らず、保存済みの球団を維持して同じスロットだけ更新する。
export async function saveCurrent(id: string): Promise<void> {
  await transaction<void>("readwrite", (tx) => {
    const store = tx.objectStore("saves");
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const save = validateSave(request.result);
        store.put({ ...save, updatedAt: new Date().toISOString() });
      } catch {
        tx.abort();
      }
    };
  });
}
