import { teams } from "../../data/teams";
import {
  fieldPositions,
  type Fielder,
  type Pitcher,
  type Player,
} from "../players/types";
import { validateBench, validateRosterState } from "../roster/roster";
import { rosterRules } from "../roster/config";
import { matchRules, minimumStartingAptitude } from "./config";
import {
  MatchInputError,
  type MatchInput,
  type MatchTeamInput,
  type MatchBatter,
  type MatchPitcher,
} from "./types";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new MatchInputError(message);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  check(
    !!value && typeof value === "object" && !Array.isArray(value),
    "試合入力の形式が不正です。",
  );
}
function integer(value: unknown, min: number, max: number) {
  check(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    "選手能力・シード等の数値が不正です。",
  );
}
const pitchTypes = [
  "fastball",
  "slider",
  "curve",
  "changeup",
  "fork",
  "sinker",
  "cutter",
];
/** 保存検証の代用ではなく、計算・登録検証で参照する現在データの境界検証。 */
function validatePlayer(value: unknown) {
  object(value);
  check(
    typeof value.id === "string" && value.id.length > 0,
    "選手IDが不正です。",
  );
  check(
    teams.some((t) => t.id === value.teamId),
    "選手の所属球団が不正です。",
  );
  check(
    value.registration === "senior" || value.registration === "development",
    "登録区分が不正です。",
  );
  check(
    value.kind === "pitcher" || value.kind === "fielder",
    "投手・野手の区分が不正です。",
  );
  check(value.throws === "R" || value.throws === "L", "投げ方が不正です。");
  check(["R", "L", "S"].includes(value.bats as string), "打ち方が不正です。");
  check(typeof value.isForeign === "boolean", "外国人区分が不正です。");
  object(value.career);
  integer(value.career.completedJapanSeasons, 0, Number.MAX_SAFE_INTEGER);
  object(value.abilities);
  if (value.kind === "fielder") {
    check(
      fieldPositions.includes(
        value.primaryPosition as (typeof fieldPositions)[number],
      ),
      "主守備位置が不正です。",
    );
    for (const key of [
      "contactVsRight",
      "contactVsLeft",
      "power",
      "speed",
      "stealing",
      "catching",
      "throwing",
      "arm",
    ])
      integer(value.abilities[key], 0, 100);
    integer(value.abilities.trajectory, 1, 4);
    object(value.positionAptitudes);
    for (const position of fieldPositions)
      integer(value.positionAptitudes[position], 0, 100);
  } else {
    check(["starter","closer","setup","middle","long"].includes(value.role as string), "投手の役割が不正です。");
    check(value.primaryPosition === "P", "投手の守備位置が不正です。");
    integer(value.abilities.velocityKmh, 1, 300);
    for (const key of [
      "control",
      "stamina",
      "starterSuitability",
      "reliefSuitability",
    ])
      integer(value.abilities[key], 0, 100);
    check(
      Array.isArray(value.abilities.pitches) &&
        value.abilities.pitches.length > 0 &&
        value.abilities.pitches.length <= pitchTypes.length,
      "所持球種が不正です。",
    );
    const seen = new Set();
    for (const item of value.abilities.pitches) {
      object(item);
      check(
        pitchTypes.includes(item.type as string) && !seen.has(item.type),
        "球種が不正または重複しています。",
      );
      seen.add(item.type);
      integer(item.power, 0, 100);
      integer(item.control, 0, 100);
      integer(item.movement, 0, 7);
    }
  }
}
function validateTeam(
  team: unknown,
  players: readonly Player[],
  roster: MatchInput["roster"],
) {
  object(team);
  check(
    teams.some((t) => t.id === team.teamId),
    "試合球団が不正です。",
  );
  check(
    Array.isArray(team.availablePlayerIds) &&
      team.availablePlayerIds.every((id) => typeof id === "string"),
    "出場可能選手IDが不正です。",
  );
  const bench = validateBench(
    players,
    roster,
    team.teamId as string,
    team.availablePlayerIds,
  );
  check(bench.ok, bench.ok ? "" : bench.reasons.join(" "));
  check(
    Array.isArray(team.battingOrder) &&
      team.battingOrder.length === matchRules.batters,
    "打順は欠員のない9人で指定してください。",
  );
  const seen = new Set<string>(),
    positions = new Set<string>();
  for (const item of team.battingOrder) {
    object(item);
    check(
      typeof item.playerId === "string" && typeof item.position === "string",
      "打順・守備位置の形式が不正です。",
    );
    const player = players.find((p) => p.id === item.playerId);
    check(
      player && player.teamId === team.teamId,
      "他球団または存在しない選手を起用できません。",
    );
    check(
      player.kind === "fielder",
      "打順9人とDHは野手です。投手は別に指定してください。",
    );
    check(!seen.has(player.id), "打順の選手が重複しています。");
    seen.add(player.id);
    check(
      team.availablePlayerIds.includes(player.id),
      "スタメンが当日の出場可能選手に含まれていません。",
    );
    check(
      (fieldPositions as readonly string[]).includes(item.position) ||
        item.position === "DH",
      "守備位置またはDH指定が不正です。",
    );
    check(!positions.has(item.position), "守備位置が重複しています。");
    positions.add(item.position);
    if (item.position !== "DH")
      check(
        player.positionAptitudes[
          item.position as (typeof fieldPositions)[number]
        ] >= minimumStartingAptitude,
        "適性のない守備位置への初期起用はできません。",
      );
  }
  check(
    positions.size === 9 &&
      positions.has("DH") &&
      fieldPositions.every((p) => positions.has(p)),
    "8守備位置とDHを各1人指定してください。",
  );
  check(typeof team.startingPitcherId === "string", "先発投手IDが不正です。");
  const pitcher = players.find((p) => p.id === team.startingPitcherId);
  check(
    pitcher && pitcher.teamId === team.teamId && pitcher.kind === "pitcher",
    "同じ球団の投手を先発に指定してください。",
  );
  check(
    team.availablePlayerIds.includes(pitcher.id) && !seen.has(pitcher.id),
    "先発投手は打順と別に、当日の出場可能選手から指定してください。",
  );
}
export function validateMatchInput(
  value: unknown,
): asserts value is MatchInput {
  object(value);
  integer(value.seed, 0, 0xffffffff);
  check(
    Array.isArray(value.players) &&
      value.players.length > 0 &&
      value.players.length <=
        teams.length * (rosterRules.senior + rosterRules.development),
    "選手配列または人数が不正です。",
  );
  for (const player of value.players) validatePlayer(player);
  const players = value.players as Player[];
  const roster = validateRosterState(players, value.roster);
  check(roster.ok, roster.ok ? "" : roster.reasons.join(" "));
  validateTeam(value.away, players, value.roster as MatchInput["roster"]);
  validateTeam(value.home, players, value.roster as MatchInput["roster"]);
  check(
    (value.away as MatchTeamInput).teamId !==
      (value.home as MatchTeamInput).teamId,
    "同じ球団同士の試合はできません。",
  );
}
/** 注入関数に渡すのも現在能力だけのコピー。元のPlayerや所属状態は渡さない。 */
export function matchBatter(player: Fielder): MatchBatter {
  return Object.freeze({
    id: player.id,
    teamId: player.teamId,
    bats: player.bats,
    abilities: Object.freeze({
      contactVsRight: player.abilities.contactVsRight,
      contactVsLeft: player.abilities.contactVsLeft,
      power: player.abilities.power,
      trajectory: player.abilities.trajectory,
      speed: player.abilities.speed,
      stealing: player.abilities.stealing,
      catching: player.abilities.catching,
      throwing: player.abilities.throwing,
      arm: player.abilities.arm,
    }),
  });
}
export function matchPitcher(player: Pitcher): MatchPitcher {
  return Object.freeze({
    id: player.id,
    teamId: player.teamId,
    throws: player.throws,
    abilities: Object.freeze({
      velocityKmh: player.abilities.velocityKmh,
      control: player.abilities.control,
      stamina: player.abilities.stamina,
      starterSuitability: player.abilities.starterSuitability,
      reliefSuitability: player.abilities.reliefSuitability,
      pitches: Object.freeze(
        player.abilities.pitches.map((p) =>
          Object.freeze({
            type: p.type,
            power: p.power,
            control: p.control,
            movement: p.movement,
          }),
        ),
      ),
    }),
  });
}
