import type { SaveSummary } from "../game/save";
import { storageErrorMessage } from "../game/saveErrors";
import {
  loadSave,
  prepareNewGame,
  readPendingGame,
  readSaves,
  type DraftView,
} from "./saves";

export interface InitialSession {
  saves: SaveSummary[];
  activeId: string | null;
  draft: DraftView | null;
  issues: string[];
}
/** 個別スロットの復元失敗は、新規ゲームや他スロットの利用を妨げない。 */
export async function initializeSession(): Promise<InitialSession> {
  let list = await readSaves();
  const issues = [...list.issues];
  let activeId: string | null = null;
  if (list.activeId) {
    try {
      await loadSave(list.activeId);
      activeId = list.activeId;
      list = await readSaves();
    } catch (error) {
      issues.push(
        `前回のスロットを読み込めませんでした。${storageErrorMessage(error)}`,
      );
    }
  }
  let draft: DraftView | null = null;
  try {
    draft = await readPendingGame();
    if (!draft && !activeId) draft = await prepareNewGame();
  } catch (error) {
    issues.push(
      `新規ゲームを準備できませんでした。${storageErrorMessage(error)}`,
    );
  }
  return { saves: list.saves, activeId, draft, issues };
}
