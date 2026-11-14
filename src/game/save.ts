import { getTeam } from "../data/teams";
import type { InitialPlayerWorld } from "./players/types";
import { validatePlayerWorld } from "./players/validate";

import { SaveDataError } from "./saveErrors";
export { SaveDataError } from "./saveErrors";
export interface SaveSummary {
  readonly schemaVersion: 1 | 2;
  readonly id: string;
  readonly teamId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface LegacyGameSave extends SaveSummary {
  readonly schemaVersion: 1;
}
/** 初期世界から切り離した、保存済みの正式なゲーム状態。毎回生成し直さない。 */
export type PlayerWorldState = Omit<InitialPlayerWorld, "phase">;
export interface GameSave extends SaveSummary {
  readonly schemaVersion: 2;
  readonly world: PlayerWorldState;
}
export interface SaveMetadata extends SaveSummary {
  readonly initialSeed?: number;
}
export interface PendingGame {
  readonly key: "pending";
  readonly id: string;
  readonly selectedTeamId: string | null;
  readonly world: InitialPlayerWorld;
}

export function validateSummary(value: unknown): SaveMetadata {
  if (!value || typeof value !== "object")
    throw new SaveDataError(
      "セーブ情報が破損しています。データは変更していません。",
    );
  const save = value as Record<string, unknown>;
  if (save.schemaVersion !== 1 && save.schemaVersion !== 2)
    throw new SaveDataError(
      "未対応のセーブ形式です。データは変更していません。",
    );
  if (
    typeof save.id !== "string" ||
    !save.id ||
    typeof save.teamId !== "string" ||
    typeof save.createdAt !== "string" ||
    !Number.isFinite(Date.parse(save.createdAt)) ||
    typeof save.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(save.updatedAt))
  )
    throw new SaveDataError(
      "セーブ情報が破損しています。データは変更していません。",
    );
  try {
    getTeam(save.teamId);
  } catch {
    throw new SaveDataError("セーブの球団情報が破損しています。");
  }
  if (
    save.schemaVersion === 2 &&
    (!Number.isInteger(save.initialSeed) ||
      (save.initialSeed as number) < 0 ||
      (save.initialSeed as number) > 0xffffffff)
  )
    throw new SaveDataError("セーブのシード情報が破損しています。");
  return value as SaveMetadata;
}
export function toSummary(save: SaveSummary): SaveSummary {
  return {
    schemaVersion: save.schemaVersion,
    id: save.id,
    teamId: save.teamId,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
  };
}
export function toMetadata(save: GameSave): SaveMetadata {
  return { ...toSummary(save), initialSeed: save.world.seed };
}
export function validateSave(value: unknown): GameSave {
  if (!value || typeof value !== "object")
    throw new SaveDataError("セーブが破損しています。");
  const save = value as GameSave;
  const metadata = validateSummary({ ...save, initialSeed: save.world?.seed });
  if (metadata.schemaVersion !== 2)
    throw new SaveDataError("旧セーブは移行してから読み込んでください。");
  validatePlayerWorld(save.world);
  return save;
}
export function createSave(teamId: string, draft: PendingGame): GameSave {
  getTeam(teamId);
  const { phase: _phase, ...world } = draft.world;
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: draft.id,
    teamId,
    createdAt: now,
    updatedAt: now,
    world,
  };
}
/** FNV-1a（UTF-16コード単位）。旧スロットIDから常に同じuint32シードを得る。 */
export function migrationSeed(id: string): number {
  let seed = 0x811c9dc5;
  for (let index = 0; index < id.length; index++)
    seed = Math.imul(seed ^ id.charCodeAt(index), 0x01000193) >>> 0;
  return seed;
}
