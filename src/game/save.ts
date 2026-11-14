import { getTeam } from "../data/teams";
export interface GameSave {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly teamId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
function createSaveId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  // getRandomValuesはHTTPでも利用できる。UUID v4のversion/variantを設定する。
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function createSave(teamId: string): GameSave {
  getTeam(teamId);
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: createSaveId(),
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
