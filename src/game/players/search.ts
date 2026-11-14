import { teams } from "../../data/teams";
import type { PublicPlayer } from "./publicPlayer";
import type {
  BattingAbilities,
  FieldPosition,
  PitchingAbilities,
} from "./types";

type FielderKey = Exclude<keyof BattingAbilities, "trajectory">;
type PitcherKey = Exclude<keyof PitchingAbilities, "pitches">;
export type AbilityId =
  | `fielder.${FielderKey}`
  | `pitcher.${PitcherKey}`
  | `position.${FieldPosition}`;
export interface AbilityDefinition {
  readonly id: AbilityId;
  readonly label: string;
  readonly kind: "pitcher" | "fielder";
  readonly unit: "score" | "kmh";
  readonly value: (player: PublicPlayer) => number | undefined;
}
const fielder = (key: FielderKey, label: string): AbilityDefinition => ({
  id: `fielder.${key}`,
  label,
  kind: "fielder",
  unit: "score",
  value: (player) =>
    player.kind === "fielder" ? player.abilities[key] : undefined,
});
const pitcher = (key: PitcherKey, label: string): AbilityDefinition => ({
  id: `pitcher.${key}`,
  label,
  kind: "pitcher",
  unit: key === "velocityKmh" ? "kmh" : "score",
  value: (player) =>
    player.kind === "pitcher" ? player.abilities[key] : undefined,
});
const position = (key: FieldPosition, label: string): AbilityDefinition => ({
  id: `position.${key}`,
  label,
  kind: "fielder",
  unit: "score",
  value: (player) =>
    player.kind === "fielder" ? player.positionAptitudes[key] : undefined,
});
/** 公開されている個別能力のみ。潜在上限や総合値の取得経路を持たない。 */
export const searchableAbilities: readonly AbilityDefinition[] = [
  fielder("contactVsRight", "対右ミート"),
  fielder("contactVsLeft", "対左ミート"),
  fielder("power", "パワー"),
  fielder("speed", "走力"),
  fielder("stealing", "盗塁"),
  fielder("catching", "捕球"),
  fielder("throwing", "スローイング"),
  fielder("arm", "肩力"),
  position("C", "捕手適性"),
  position("1B", "一塁適性"),
  position("2B", "二塁適性"),
  position("3B", "三塁適性"),
  position("SS", "遊撃適性"),
  position("LF", "左翼適性"),
  position("CF", "中堅適性"),
  position("RF", "右翼適性"),
  pitcher("velocityKmh", "球速"),
  pitcher("control", "制球"),
  pitcher("stamina", "スタミナ"),
  pitcher("starterSuitability", "先発適性"),
  pitcher("reliefSuitability", "救援適性"),
];
export const getSearchAbility = (id: string) =>
  searchableAbilities.find((ability) => ability.id === id);
export type SortKey = "kind" | "name" | "age" | "salary" | AbilityId;
export interface PlayerQuery {
  scope: "own" | "all" | "blue" | "red" | "team";
  teamId: string;
  name: string;
  kind: "all" | "pitcher" | "fielder";
  registration: "all" | "senior" | "development";
  position: "all" | "P" | FieldPosition;
  ageMin: string;
  ageMax: string;
  throws: "all" | "R" | "L";
  bats: "all" | "R" | "L" | "S";
  foreign: "all" | "foreign" | "domestic";
  ability: AbilityId | "";
  abilityMin: string;
  abilityMax: string;
  sort: SortKey;
  direction: "asc" | "desc";
}
export function defaultPlayerQuery(teamId: string): PlayerQuery {
  return {
    scope: "own",
    teamId,
    name: "",
    kind: "all",
    registration: "all",
    position: "all",
    ageMin: "",
    ageMax: "",
    throws: "all",
    bats: "all",
    foreign: "all",
    ability: "",
    abilityMin: "",
    abilityMax: "",
    sort: "kind",
    direction: "asc",
  };
}
/** 全半角・英字大小・空白・中黒・ひらがな／カタカナを正規化。読み仮名は推測しない。 */
export function normalizePlayerName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s・･·]/gu, "")
    .replace(/[ァ-ヶ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    );
}
class SearchInputError extends Error {}
function range(
  minText: string,
  maxText: string,
  label: string,
  maxAllowed = Number.MAX_SAFE_INTEGER,
) {
  function number(text: string): number | undefined {
    const normalized = text.normalize("NFKC").trim();
    if (!normalized) return undefined;
    const value = Number(normalized);
    if (
      !/^\d+$/.test(normalized) ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > maxAllowed
    )
      throw new SearchInputError(
        `${label}は${maxAllowed === Number.MAX_SAFE_INTEGER ? "0以上の安全に扱える整数" : `0〜${maxAllowed}の整数`}で指定してください。`,
      );
    return value;
  }
  const min = number(minText),
    max = number(maxText);
  if (min !== undefined && max !== undefined && min > max)
    throw new SearchInputError(`${label}の下限は上限以下にしてください。`);
  return (value: number) =>
    (min === undefined || value >= min) && (max === undefined || value <= max);
}
const nameOrder = new Intl.Collator("ja", {
  sensitivity: "base",
  numeric: true,
});
const idOrder = (a: PublicPlayer, b: PublicPlayer) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export interface PlayerSearchResult {
  readonly players: readonly PublicPlayer[];
  readonly error: string | null;
}
/** 公開DTOの参照だけをフィルタし、配列をコピーして並べ替える。保存データへ書き込まない。 */
export function searchPlayers(
  players: readonly PublicPlayer[],
  query: PlayerQuery,
  managedTeamId: string,
): PlayerSearchResult {
  try {
    const ageMatches = range(query.ageMin, query.ageMax, "年齢");
    const ability = query.ability ? getSearchAbility(query.ability) : undefined;
    const sortAbility = getSearchAbility(query.sort);
    if (
      (query.ability && !ability) ||
      (!["kind", "name", "age", "salary"].includes(query.sort) && !sortAbility)
    )
      throw new SearchInputError("選択した能力には対応していません。");
    if (!["asc", "desc"].includes(query.direction))
      throw new SearchInputError("並び順が不正です。");
    const abilityMatches = ability
      ? range(
          query.abilityMin,
          query.abilityMax,
          ability.label,
          ability.unit === "score" ? 100 : Number.MAX_SAFE_INTEGER,
        )
      : null;
    const name = normalizePlayerName(query.name);
    const scopeTeams =
      query.scope === "own"
        ? [managedTeamId]
        : query.scope === "team"
          ? [query.teamId]
          : teams
              .filter(
                (team) => query.scope === "all" || team.league === query.scope,
              )
              .map((team) => team.id);
    if (
      !scopeTeams.length ||
      scopeTeams.some((id) => !teams.some((team) => team.id === id))
    )
      throw new SearchInputError("閲覧対象の球団を確認してください。");
    const filtered = players.filter((player) => {
      if (
        !scopeTeams.includes(player.teamId) ||
        !normalizePlayerName(player.name).includes(name) ||
        !ageMatches(player.age)
      )
        return false;
      if (query.kind !== "all" && player.kind !== query.kind) return false;
      if (
        query.registration !== "all" &&
        player.registration !== query.registration
      )
        return false;
      if (query.position !== "all" && player.primaryPosition !== query.position)
        return false;
      if (query.throws !== "all" && player.throws !== query.throws)
        return false;
      if (query.bats !== "all" && player.bats !== query.bats) return false;
      if (
        query.foreign !== "all" &&
        player.isForeign !== (query.foreign === "foreign")
      )
        return false;
      if (ability) {
        const value = ability.value(player);
        if (value === undefined || !abilityMatches!(value)) return false;
      }
      return !sortAbility || sortAbility.value(player) !== undefined;
    });
    const direction = query.direction === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const difference = sortAbility
        ? sortAbility.value(a)! - sortAbility.value(b)!
        : query.sort === "name"
          ? nameOrder.compare(
              normalizePlayerName(a.name),
              normalizePlayerName(b.name),
            )
          : query.sort === "age"
            ? a.age - b.age
            : query.sort === "salary"
              ? a.contract.annualSalaryManYen - b.contract.annualSalaryManYen
              : Number(a.kind === "fielder") - Number(b.kind === "fielder");
      return difference * direction || idOrder(a, b);
    });
    return { players: filtered, error: null };
  } catch (error) {
    if (error instanceof SearchInputError)
      return { players: [], error: error.message };
    throw error;
  }
}
