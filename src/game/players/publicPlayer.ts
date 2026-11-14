import {
  fieldPositions,
  type BattingStats,
  type Fielder,
  type Pitcher,
  type PitchingStats,
  type Player,
  type SeasonRecord,
} from "./types";

interface PublicBase extends Pick<
  Player,
  | "id"
  | "name"
  | "age"
  | "throws"
  | "bats"
  | "teamId"
  | "registration"
  | "fitness"
  | "condition"
  | "isForeign"
> {
  readonly contract: {
    readonly years: number;
    readonly annualSalaryManYen: number;
  };
  readonly career: Pick<
    Player["career"],
    "background" | "entryAge" | "completedProSeasons"
  >;
}
export interface PublicFielder extends PublicBase {
  readonly kind: "fielder";
  readonly primaryPosition: Fielder["primaryPosition"];
  readonly abilities: Fielder["abilities"];
  readonly positionAptitudes: Fielder["positionAptitudes"];
  readonly history: readonly SeasonRecord<BattingStats>[];
}
export interface PublicPitcher extends PublicBase {
  readonly kind: "pitcher";
  readonly primaryPosition: "P";
  readonly role: Pitcher["role"];
  readonly abilities: Pitcher["abilities"];
  readonly history: readonly SeasonRecord<PitchingStats>[];
}
export type PublicPlayer = PublicFielder | PublicPitcher;
function pick<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}
const battingStatKeys = [
  "games",
  "plateAppearances",
  "atBats",
  "hits",
  "doubles",
  "triples",
  "homeRuns",
  "walks",
  "hitByPitches",
  "sacrificeBunts",
  "sacrificeFlies",
  "strikeouts",
  "runs",
  "runsBattedIn",
  "stolenBases",
  "caughtStealing",
] as const;
const pitchingStatKeys = [
  "games",
  "starts",
  "outs",
  "hitsAllowed",
  "homeRunsAllowed",
  "walks",
  "strikeouts",
  "runsAllowed",
  "earnedRuns",
  "wins",
  "losses",
  "saves",
  "holds",
] as const;
function history<T>(
  records: readonly SeasonRecord<T>[],
  project: (stats: T) => T,
): SeasonRecord<T>[] {
  return records.map((record) => ({
    season: record.season,
    age: record.age,
    teamId: record.teamId,
    registration: record.registration,
    firstTeam: project(record.firstTeam),
    farmTeam: project(record.farmTeam),
  }));
}
/** ネストもホワイトリストで新しく構築する。元選手オブジェクトをそのままUIへ渡さない。 */
export function toPublicPlayer(player: Player): PublicPlayer {
  const base: PublicBase = {
    id: player.id,
    name: player.name,
    age: player.age,
    throws: player.throws,
    bats: player.bats,
    teamId: player.teamId,
    registration: player.registration,
    fitness: player.fitness,
    condition: player.condition,
    isForeign: player.isForeign,
    contract: pick(player.contract, ["years", "annualSalaryManYen"]),
    career: pick(player.career, [
      "background",
      "entryAge",
      "completedProSeasons",
    ]),
  };
  if (player.kind === "fielder")
    return {
      ...base,
      kind: "fielder",
      primaryPosition: player.primaryPosition,
      abilities: pick(player.abilities, [
        "contactVsRight",
        "contactVsLeft",
        "power",
        "trajectory",
        "speed",
        "stealing",
        "catching",
        "throwing",
        "arm",
      ]),
      positionAptitudes: pick(player.positionAptitudes, fieldPositions),
      history: history(player.history, (stats) => pick(stats, battingStatKeys)),
    };
  return {
    ...base,
    kind: "pitcher",
    primaryPosition: "P",
    role: player.role,
    abilities: {
      ...pick(player.abilities, [
        "velocityKmh",
        "control",
        "stamina",
        "starterSuitability",
        "reliefSuitability",
      ]),
      pitches: player.abilities.pitches.map((pitch) =>
        pick(pitch, ["type", "power", "control", "movement"]),
      ),
    },
    history: history(player.history, (stats) => pick(stats, pitchingStatKeys)),
  };
}
