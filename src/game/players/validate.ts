import { SaveDataError } from "../saveErrors";
import { teams } from "../../data/teams";
import type { PlayerWorldState } from "../save";
import { fieldPositions } from "./types";

function check(condition: unknown): asserts condition {
  if (!condition)
    throw new SaveDataError(
      "選手データが破損、または未対応の形式です。保存データは変更していません。",
    );
}
type Data = Record<string, unknown>;
function object(value: unknown): Data {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Data;
}
function integer(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  check(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
  );
}
function text(value: unknown): asserts value is string {
  check(typeof value === "string" && value.trim().length > 0);
}
function oneOf(value: unknown, choices: readonly unknown[]) {
  check(choices.includes(value));
}
const battingKeys = [
  "contactVsRight",
  "contactVsLeft",
  "power",
  "trajectory",
  "speed",
  "stealing",
  "catching",
  "throwing",
  "arm",
];
const pitchingKeys = [
  "velocityKmh",
  "control",
  "stamina",
  "starterSuitability",
  "reliefSuitability",
];
const pitchTypes = [
  "fastball",
  "slider",
  "curve",
  "changeup",
  "fork",
  "sinker",
  "cutter",
];
const battingStats = [
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
];
const pitchingStats = [
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
];
const teamIds = new Set(teams.map((team) => team.id));

function abilities(value: unknown, kind: unknown): Data {
  const data = object(value);
  for (const key of kind === "fielder" ? battingKeys : pitchingKeys) {
    integer(
      data[key],
      key === "trajectory" ? 1 : key === "velocityKmh" ? 1 : 0,
      key === "trajectory" ? 4 : key === "velocityKmh" ? 300 : 100,
    );
  }
  if (kind === "pitcher") {
    check(Array.isArray(data.pitches) && data.pitches.length > 0);
    const types = new Set();
    for (const item of data.pitches) {
      const pitch = object(item);
      oneOf(pitch.type, pitchTypes);
      check(!types.has(pitch.type));
      types.add(pitch.type);
      integer(pitch.power, 0, 100);
      integer(pitch.control, 0, 100);
      integer(pitch.movement, 0, 7);
    }
  }
  return data;
}
function stats(value: unknown, kind: unknown): Data {
  const data = object(value);
  for (const key of kind === "fielder" ? battingStats : pitchingStats)
    integer(data[key]);
  const n = data as Record<string, number>;
  if (kind === "fielder") {
    check(
      n.atBats +
        n.walks +
        n.hitByPitches +
        n.sacrificeBunts +
        n.sacrificeFlies ===
        n.plateAppearances,
    );
    check(
      n.hits <= n.atBats &&
        n.doubles + n.triples + n.homeRuns <= n.hits &&
        n.strikeouts + n.hits <= n.atBats,
    );
  } else {
    check(
      n.starts <= n.games &&
        n.earnedRuns <= n.runsAllowed &&
        n.homeRunsAllowed <= n.hitsAllowed &&
        n.strikeouts <= n.outs,
    );
    check(n.wins + n.losses + n.saves + n.holds <= n.games);
  }
  return data;
}
/** 保存済み状態を検証する。将来の増減に備え、912人や初期年齢の固定条件を課さない。 */
export function validatePlayerWorld(
  value: unknown,
): asserts value is PlayerWorldState {
  const world = object(value);
  check(world.generationVersion === 1);
  integer(world.seed, 0, 0xffffffff);
  integer(world.randomState, 0, 0xffffffff);
  check(Array.isArray(world.players));
  const hidden = object(world.developmentByPlayerId);
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const item of world.players) {
    const player = object(item);
    text(player.id);
    text(player.name);
    text(player.teamId);
    check(teamIds.has(player.teamId) && !ids.has(player.id));
    ids.add(player.id);
    oneOf(player.kind, ["fielder", "pitcher"]);
    oneOf(player.registration, ["senior", "development"]);
    const countKey = `${player.teamId}:${player.registration}`;
    counts.set(countKey, (counts.get(countKey) ?? 0) + 1);
    check(
      counts.get(countKey)! <= (player.registration === "senior" ? 70 : 10),
    );
    integer(player.age);
    integer(player.fitness, 0, 100);
    oneOf(player.throws, ["R", "L"]);
    oneOf(player.bats, ["R", "L", "S"]);
    oneOf(player.condition, ["絶好調", "好調", "普通", "不調", "絶不調"]);
    check(typeof player.isForeign === "boolean");
    const contract = object(player.contract);
    integer(contract.years, 1, 5);
    integer(contract.annualSalaryManYen);
    const career = object(player.career);
    oneOf(career.background, [
      "highSchool",
      "university",
      "corporate",
      "independent",
      "foreign",
    ]);
    integer(career.entryAge, 0, player.age);
    integer(career.completedProSeasons, 0, player.age - career.entryAge);
    integer(career.completedJapanSeasons, 0, career.completedProSeasons);
    const current = abilities(player.abilities, player.kind);
    if (player.kind === "fielder") {
      oneOf(player.primaryPosition, fieldPositions);
      const positions = object(player.positionAptitudes);
      for (const position of fieldPositions)
        integer(positions[position], 0, 100);
    } else {
      check(player.primaryPosition === "P");
      oneOf(player.role, ["starter", "closer", "setup", "middle", "long"]);
    }
    check(Array.isArray(player.history));
    for (const item of player.history) {
      const record = object(item);
      integer(record.season, Number.MIN_SAFE_INTEGER);
      integer(record.age, 0, player.age);
      check(typeof record.teamId === "string" && teamIds.has(record.teamId));
      oneOf(record.registration, ["senior", "development"]);
      const first = stats(record.firstTeam, player.kind);
      stats(record.farmTeam, player.kind);
      if (record.registration === "development")
        check(Object.values(first).every((value) => value === 0));
    }
    check(Object.hasOwn(hidden, player.id));
    const development = object(hidden[player.id]);
    check(development.kind === player.kind);
    oneOf(development.growthType, ["early", "standard", "late"]);
    const caps = abilities(development.abilityCaps, player.kind);
    for (const key of player.kind === "fielder" ? battingKeys : pitchingKeys)
      check((caps[key] as number) >= (current[key] as number));
    if (player.kind === "pitcher") {
      const pitches = current.pitches as Data[];
      const capPitches = caps.pitches as Data[];
      check(pitches.length === capPitches.length);
      for (const pitch of pitches) {
        const cap = capPitches.find((cap) => cap.type === pitch.type);
        check(cap);
        for (const key of ["power", "control", "movement"])
          check((cap[key] as number) >= (pitch[key] as number));
      }
    }
  }
  check(Object.keys(hidden).length === ids.size);
}
