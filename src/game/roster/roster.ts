import { teams } from "../../data/teams";
import { fieldPositions, type Player } from "../players/types";
import { initialRosterConfig, rosterRules as rules } from "./config";
import type {
  GameDay,
  RosterChange,
  RosterCheck,
  RosterState,
  Squad,
} from "./types";
const fail = (...reasons: string[]) => ({ ok: false as const, reasons });
const validDay = (day: unknown): day is GameDay =>
  typeof day === "number" && Number.isSafeInteger(day) && day >= 0;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
/** 外国籍の有無と外国人枠対象は別。完了8季以上は対象外。 */
export function countsAsForeign(player: Player): boolean {
  return (
    player.isForeign &&
    player.career.completedJapanSeasons < rules.foreignExemptionSeasons
  );
}
export function isFirstTeam(
  state: RosterState,
  teamId: string,
  playerId: string,
): boolean {
  return (
    Object.hasOwn(state.byTeam, teamId) &&
    state.byTeam[teamId].firstTeamIds.includes(playerId)
  );
}
export function playerSquad(
  state: RosterState,
  player: Pick<Player, "id" | "teamId">,
): Squad {
  return isFirstTeam(state, player.teamId, player.id) ? "first" : "farm";
}
export function foreignCounts(players: readonly Player[]) {
  const counted = players.filter(countsAsForeign);
  return {
    total: counted.length,
    pitchers: counted.filter((p) => p.kind === "pitcher").length,
    fielders: counted.filter((p) => p.kind === "fielder").length,
  };
}
function firstLimits(players: readonly Player[]): RosterCheck {
  if (players.length > rules.firstTeam) return fail("1軍登録は31人までです。");
  const foreign = foreignCounts(players);
  if (foreign.total > rules.foreignFirst)
    return fail("外国人枠対象の1軍登録は5人までです。");
  if (foreign.pitchers > rules.foreignPitchers)
    return fail("外国人枠対象の投手は4人までです。");
  if (foreign.fielders > rules.foreignFielders)
    return fail("外国人枠対象の野手は4人までです。");
  return { ok: true };
}
/** 不明・破損した所属情報を補完しない。全12球団・登録ID・抹消日を検証。 */
export function validateRosterState(
  players: readonly Player[],
  value: unknown,
): RosterCheck {
  if (
    !object(value) ||
    !validDay(value.currentDay) ||
    !object(value.byTeam) ||
    !object(value.deregisteredOnByPlayerId)
  )
    return fail("所属状態または相対日が不正です。");
  const state = value as unknown as RosterState;
  const teamIds = teams.map((t) => t.id);
  if (
    Object.keys(state.byTeam).length !== teamIds.length ||
    teamIds.some((id) => !Object.hasOwn(state.byTeam, id))
  )
    return fail("全12球団の所属情報が必要です。");
  const index = new Map(players.map((p) => [p.id, p]));
  if (index.size !== players.length) return fail("選手IDが重複しています。");
  if (players.some((p) => !teamIds.includes(p.teamId)))
    return fail("選手の所属球団が不正です。");
  for (const team of teams) {
    const all = players.filter((p) => p.teamId === team.id);
    if (
      all.filter((p) => p.registration === "senior").length > rules.senior ||
      all.filter((p) => p.registration === "development").length >
        rules.development
    )
      return fail("支配下70人・育成10人の上限を超えています。");
    const roster = state.byTeam[team.id];
    if (!object(roster) || !Array.isArray(roster.firstTeamIds))
      return fail("1軍登録一覧が不正です。");
    const ids = roster.firstTeamIds;
    if (
      ids.some((id) => typeof id !== "string") ||
      new Set(ids).size !== ids.length
    )
      return fail("1軍登録IDが不正または重複しています。");
    const selected: Player[] = [];
    for (const id of ids) {
      const p = index.get(id);
      if (!p) return fail("登録対象の選手が存在しません。");
      if (p.teamId !== team.id) return fail("他球団の選手は登録できません。");
      if (p.registration !== "senior")
        return fail("育成選手は1軍登録できません。");
      selected.push(p);
    }
    const limits = firstLimits(selected);
    if (!limits.ok) return limits;
  }
  for (const [id, day] of Object.entries(state.deregisteredOnByPlayerId)) {
    const p = index.get(id);
    if (!p || !validDay(day) || day > state.currentDay)
      return fail("抹消日または選手IDが不正です。");
    if (
      isFirstTeam(state, p.teamId, id) &&
      state.currentDay - day < rules.reentryDays
    )
      return fail("抹消後10日間は1軍再登録できません。");
  }
  return { ok: true };
}
export function canRegisterFirstTeam(
  players: readonly Player[],
  state: RosterState,
  teamId: string,
  id: string,
): RosterCheck {
  const valid = validateRosterState(players, state);
  if (!valid.ok) return valid;
  const p = players.find((p) => p.id === id);
  if (!p) return fail("登録対象の選手が存在しません。");
  if (p.teamId !== teamId) return fail("他球団の選手は登録できません。");
  if (p.registration !== "senior") return fail("育成選手は1軍登録できません。");
  if (isFirstTeam(state, teamId, id))
    return fail("すでに1軍登録されています（重複登録不可）。");
  const day = Object.hasOwn(state.deregisteredOnByPlayerId, id)
    ? state.deregisteredOnByPlayerId[id]
    : undefined;
  if (day !== undefined && state.currentDay - day < rules.reentryDays)
    return fail("抹消後10日間は1軍再登録できません。");
  const ids = new Set([...state.byTeam[teamId].firstTeamIds, id]);
  return firstLimits(players.filter((p) => ids.has(p.id)));
}
export function registerFirstTeam(
  players: readonly Player[],
  state: RosterState,
  teamId: string,
  id: string,
): RosterChange {
  const check = canRegisterFirstTeam(players, state, teamId, id);
  if (!check.ok) return check;
  return {
    ok: true,
    state: {
      ...state,
      byTeam: {
        ...state.byTeam,
        [teamId]: { firstTeamIds: [...state.byTeam[teamId].firstTeamIds, id] },
      },
    },
  };
}
export function deregisterFirstTeam(
  players: readonly Player[],
  state: RosterState,
  teamId: string,
  id: string,
): RosterChange {
  const check = validateRosterState(players, state);
  if (!check.ok) return check;
  const p = players.find((p) => p.id === id);
  if (!p || p.teamId !== teamId)
    return fail("抹消対象の選手または所属球団が不正です。");
  if (!isFirstTeam(state, teamId, id))
    return fail("1軍登録されていない選手は抹消できません。");
  return {
    ok: true,
    state: {
      ...state,
      byTeam: {
        ...state.byTeam,
        [teamId]: {
          firstTeamIds: state.byTeam[teamId].firstTeamIds.filter(
            (x) => x !== id,
          ),
        },
      },
      deregisteredOnByPlayerId: {
        ...state.deregisteredOnByPlayerId,
        [id]: state.currentDay,
      },
    },
  };
}
/** 日程処理から明示的に呼ぶ。実時間やシーズン替わりで自動更新しない。 */
export function advanceRosterDay(
  state: RosterState,
  day: GameDay,
): RosterChange {
  if (!validDay(state.currentDay) || !validDay(day) || day < state.currentDay)
    return fail("相対日は非負の安全な整数で、現在日より前には戻せません。");
  return { ok: true, state: { ...state, currentDay: day } };
}
export function validateBench(
  players: readonly Player[],
  state: RosterState,
  teamId: string,
  ids: readonly string[],
): RosterCheck {
  const valid = validateRosterState(players, state);
  if (!valid.ok) return valid;
  if (!Object.hasOwn(state.byTeam, teamId)) return fail("球団IDが不正です。");
  if (ids.length > rules.bench) return fail("ベンチ入りは26人までです。");
  if (new Set(ids).size !== ids.length)
    return fail("ベンチ入り選手が重複しています。");
  const selected: Player[] = [];
  for (const id of ids) {
    const p = players.find((p) => p.id === id);
    if (!p || p.teamId !== teamId)
      return fail("他球団または存在しない選手はベンチ入りできません。");
    if (p.registration !== "senior" || !isFirstTeam(state, teamId, id))
      return fail("ベンチ入りは支配下の1軍登録選手に限ります。");
    selected.push(p);
  }
  const foreign = foreignCounts(selected);
  if (foreign.total > rules.foreignBench)
    return fail("ベンチの外国人枠対象は4人までです。");
  if (foreign.total === 4 && (foreign.pitchers === 0 || foreign.fielders === 0))
    return fail("ベンチの外国人4人は投手のみ・野手のみにはできません。");
  return { ok: true };
}
/** ID順と役割・主守備位置だけで決定。公開能力の合成評価も潜在情報も参照しない。 */
export function createInitialRosters(players: readonly Player[]): RosterState {
  let state: RosterState = {
    currentDay: 0,
    byTeam: Object.fromEntries(teams.map((t) => [t.id, { firstTeamIds: [] }])),
    deregisteredOnByPlayerId: {},
  };
  const valid = validateRosterState(players, state);
  if (!valid.ok) throw new Error(valid.reasons.join(" "));
  for (const team of teams) {
    const candidates = players
      .filter((p) => p.teamId === team.id && p.registration === "senior")
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const add = (p: Player) => {
      if (isFirstTeam(state, team.id, p.id)) return;
      const result = registerFirstTeam(players, state, team.id, p.id);
      if (result.ok) state = result.state;
    };
    const take = (rows: readonly Player[], limit: number) => {
      let n = 0;
      for (const p of rows) {
        if (n >= limit) break;
        if (isFirstTeam(state, team.id, p.id)) continue;
        const before = state;
        add(p);
        if (before !== state) n++;
      }
    };
    const pitchers = candidates.filter((p) => p.kind === "pitcher"),
      fielders = candidates.filter((p) => p.kind === "fielder");
    take(
      fielders.filter((p) => p.primaryPosition === "C"),
      initialRosterConfig.catchers,
    );
    for (const position of fieldPositions.filter((p) => p !== "C"))
      take(
        fielders.filter((p) => p.primaryPosition === position),
        initialRosterConfig.perOtherPosition,
      );
    take(
      pitchers.filter((p) => p.kind === "pitcher" && p.role === "starter"),
      initialRosterConfig.starters,
    );
    const registered = () =>
      players.filter((p) => isFirstTeam(state, team.id, p.id));
    take(
      pitchers.filter((p) => p.kind === "pitcher" && p.role !== "starter"),
      initialRosterConfig.pitchers -
        registered().filter((p) => p.kind === "pitcher").length,
    );
    take(
      pitchers,
      initialRosterConfig.pitchers -
        registered().filter((p) => p.kind === "pitcher").length,
    );
    take(
      fielders,
      initialRosterConfig.fielders -
        registered().filter((p) => p.kind === "fielder").length,
    );
    take(candidates, rules.firstTeam - registered().length);
  }
  return state;
}
