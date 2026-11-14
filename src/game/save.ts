import { getTeam } from "../data/teams";
export interface GameSave {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly teamId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export function createSave(teamId: string): GameSave {
  getTeam(teamId);
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    teamId,
    createdAt: now,
    updatedAt: now,
  };
}
export function validateSave(value: unknown): GameSave {
  if (!value || typeof value !== "object")
    throw new Error("セーブ形式を確認できません。");
  const save = value as Record<string, unknown>;
  if (
    save.schemaVersion !== 1 ||
    typeof save.id !== "string" ||
    !save.id ||
    typeof save.teamId !== "string" ||
    typeof save.createdAt !== "string" ||
    !Number.isFinite(Date.parse(save.createdAt)) ||
    typeof save.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(save.updatedAt))
  ) {
    throw new Error(
      "未対応または破損したセーブデータです。データは変更していません。",
    );
  }
  getTeam(save.teamId);
  return value as GameSave;
}
