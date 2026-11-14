import { describe, expect, it } from "vitest";
import { teams } from "../data/teams";
import { generateInitialPlayerWorld } from "../game/players/generate";
import type { Player } from "../game/players/types";
import {
  advanceRosterDay,
  canRegisterFirstTeam,
  countsAsForeign,
  createInitialRosters,
  deregisterFirstTeam,
  foreignCounts,
  isFirstTeam,
  playerSquad,
  registerFirstTeam,
  validateBench,
  validateRosterState,
} from "../game/roster/roster";
import type { RosterChange, RosterState } from "../game/roster/types";
const world = generateInitialPlayerWorld(4512);
const own = teams[0].id;
const blank = (): RosterState => ({
  currentDay: 0,
  byTeam: Object.fromEntries(teams.map((t) => [t.id, { firstTeamIds: [] }])),
  deregisteredOnByPlayerId: {},
});
const updated = (result: RosterChange) => {
  if (!result.ok) throw Error(result.reasons.join(" "));
  return result.state;
};
function fixture(
  kind: "pitcher" | "fielder",
  id: string,
  foreign = false,
  japan = 0,
): Player {
  const p = world.players.find((p) => p.kind === kind)!;
  return {
    ...p,
    id,
    teamId: own,
    registration: "senior",
    isForeign: foreign,
    age: 35,
    career: {
      ...p.career,
      entryAge: 20,
      completedProSeasons: 15,
      completedJapanSeasons: japan,
    },
  };
}
const withIds = (ids: readonly string[]): RosterState => ({
  ...blank(),
  byTeam: { ...blank().byTeam, [own]: { firstTeamIds: ids } },
});
function rejected(
  result: RosterChange | ReturnType<typeof validateBench>,
  reason: RegExp,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reasons.join(" ")).toMatch(reason);
}

describe("所属・初期選定", () => {
  it.each([4512, 9, 123456])(
    "シード%iの12球団で31人・投手15野手16・各守備位置と役割のバランスを決定的に満たす",
    (seed) => {
      const players = generateInitialPlayerWorld(seed).players;
      const snapshot = JSON.stringify(players);
      const state = createInitialRosters(players);
      expect(Object.keys(state.byTeam)).toHaveLength(12);
      expect(validateRosterState(players, state)).toEqual({ ok: true });
      for (const t of teams) {
        const registered = players.filter((p) =>
          isFirstTeam(state, t.id, p.id),
        );
        expect(registered).toHaveLength(31);
        expect(
          registered.every(
            (p) => p.teamId === t.id && p.registration === "senior",
          ),
        ).toBe(true);
        expect(registered.filter((p) => p.kind === "pitcher")).toHaveLength(15);
        expect(
          registered.filter(
            (p) => p.kind === "pitcher" && p.role === "starter",
          ),
        ).toHaveLength(6);
        expect(
          registered.filter((p) => p.primaryPosition === "C"),
        ).toHaveLength(2);
        expect(
          new Set(
            registered
              .filter((p) => p.kind === "fielder")
              .map((p) => p.primaryPosition),
          ).size,
        ).toBe(8);
        expect(foreignCounts(registered).total).toBeLessThanOrEqual(5);
        for (const p of players.filter((p) => p.teamId === t.id))
          expect(playerSquad(state, p)).toBe(
            registered.includes(p) ? "first" : "farm",
          );
      }
      expect(createInitialRosters([...players].reverse())).toEqual(state);
      expect(JSON.stringify(players)).toBe(snapshot);
    },
  );
  it("欠員のある旧世界でも生成・水増しせず上限内で初期化する", () => {
    const p = fixture("fielder", "only");
    expect(createInitialRosters([p]).byTeam[own].firstTeamIds).toEqual([p.id]);
    expect(createInitialRosters([])).toEqual(blank());
  });
  it("育成・他球団・存在しないID・重複・32人目を拒否し、元データは不変", () => {
    const players = Array.from({ length: 32 }, (_, i) =>
      fixture("pitcher", `p${i}`),
    );
    players.push(
      { ...fixture("fielder", "development"), registration: "development" },
      { ...fixture("fielder", "other"), teamId: teams[1].id },
    );
    let state = blank();
    const snapshot = JSON.stringify(players);
    rejected(registerFirstTeam(players, state, own, "development"), /育成/);
    rejected(registerFirstTeam(players, state, own, "other"), /他球団/);
    rejected(registerFirstTeam(players, state, own, "missing"), /存在/);
    for (const p of players.slice(0, 31))
      state = updated(registerFirstTeam(players, state, own, p.id));
    const before = JSON.stringify(state);
    rejected(registerFirstTeam(players, state, own, "p31"), /31人/);
    rejected(registerFirstTeam(players, state, own, "p0"), /重複/);
    expect(canRegisterFirstTeam(players, state, own, "p31").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(JSON.stringify(players)).toBe(snapshot);
  });
  it("保存状態の登録上限・未知球団・重複ID・不正な抹消日を補完せず拒否", () => {
    const p = fixture("pitcher", "p");
    for (const state of [
      null,
      {},
      { ...blank(), currentDay: -1 },
      { ...blank(), currentDay: 1.5 },
      { ...blank(), byTeam: {} },
      withIds([p.id, p.id]),
      withIds(["missing"]),
      { ...blank(), deregisteredOnByPlayerId: { p: 1 } },
      { ...blank(), deregisteredOnByPlayerId: { missing: 0 } },
    ])
      expect(validateRosterState([p], state).ok).toBe(false);
    expect(validateRosterState([p, p], blank()).ok).toBe(false);
    expect(
      validateRosterState(
        Array.from({ length: 71 }, (_, i) => fixture("pitcher", `p${i}`)),
        blank(),
      ).ok,
    ).toBe(false);
    expect(
      validateRosterState(
        Array.from({ length: 11 }, (_, i) => ({
          ...fixture("pitcher", `d${i}`),
          registration: "development" as const,
        })),
        blank(),
      ).ok,
    ).toBe(false);
  });
});
describe("外国人・ベンチ・抹消制約", () => {
  it("外国人5人まで、投手4人・野手4人までを独立に制限する", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => fixture("pitcher", `p${i}`, true)),
      ...Array.from({ length: 5 }, (_, i) => fixture("fielder", `f${i}`, true)),
    ];
    for (const kind of ["p", "f"]) {
      let state = blank();
      for (let i = 0; i < 4; i++)
        state = updated(registerFirstTeam(players, state, own, `${kind}${i}`));
      rejected(registerFirstTeam(players, state, own, `${kind}4`), /4人/);
    }
    let state = withIds(["p0", "p1", "p2", "f0", "f1"]);
    expect(validateRosterState(players, state).ok).toBe(true);
    rejected(registerFirstTeam(players, state, own, "f2"), /5人/);
    expect(state.byTeam[own].firstTeamIds).toHaveLength(5);
  });
  it("日本完了7季は対象、8季・9季は免除。国内選手も枠外", () => {
    const players = [
      fixture("pitcher", "seven", true, 7),
      fixture("pitcher", "eight", true, 8),
      fixture("fielder", "nine", true, 9),
      fixture("fielder", "domestic", false, 0),
    ];
    expect(players.map(countsAsForeign)).toEqual([true, false, false, false]);
    expect(foreignCounts(players)).toEqual({
      total: 1,
      pitchers: 1,
      fielders: 0,
    });
    const many = Array.from({ length: 7 }, (_, i) =>
      fixture("pitcher", `e${i}`, true, 8),
    );
    expect(validateRosterState(many, withIds(many.map((p) => p.id))).ok).toBe(
      true,
    );
    expect(
      validateBench(
        many,
        withIds(many.map((p) => p.id)),
        own,
        many.map((p) => p.id),
      ).ok,
    ).toBe(true);
  });
  it("抹消当日〜9日後は不可、10日後から可。通算日なので季を跨いでも維持", () => {
    const p = fixture("pitcher", "p"),
      players = [p];
    const initial = withIds([p.id]);
    const removed = updated(deregisterFirstTeam(players, initial, own, p.id));
    expect(removed.deregisteredOnByPlayerId[p.id]).toBe(0);
    expect(isFirstTeam(initial, own, p.id)).toBe(true);
    expect(playerSquad(removed, p)).toBe("farm");
    for (const day of [0, 1, 9])
      rejected(
        registerFirstTeam(
          players,
          updated(advanceRosterDay(removed, day)),
          own,
          p.id,
        ),
        /10日/,
      );
    const day10 = updated(advanceRosterDay(removed, 10));
    const registered = updated(registerFirstTeam(players, day10, own, p.id));
    expect(isFirstTeam(registered, own, p.id)).toBe(true);
    const removedAgain = updated(
      deregisterFirstTeam(players, registered, own, p.id),
    );
    expect(removedAgain.deregisteredOnByPlayerId[p.id]).toBe(10);
    rejected(
      registerFirstTeam(
        players,
        updated(advanceRosterDay(removedAgain, 19)),
        own,
        p.id,
      ),
      /10日/,
    );
    expect(
      canRegisterFirstTeam(
        players,
        updated(advanceRosterDay(removedAgain, 20)),
        own,
        p.id,
      ).ok,
    ).toBe(true);
    rejected(
      deregisterFirstTeam(players, removed, own, p.id),
      /登録されていない/,
    );
    rejected(advanceRosterDay(day10, 9), /戻せません/);
    for (const day of [-1, NaN, Infinity, 1.2])
      rejected(advanceRosterDay(removed, day), /相対日/);
    rejected(
      validateRosterState(players, { ...removed, byTeam: initial.byTeam }),
      /10日/,
    );
  });
  it("ベンチ26人、1軍限定、重複・他球団・育成を検証し、状態を変えない", () => {
    const players = Array.from({ length: 28 }, (_, i) =>
      fixture("fielder", `p${i}`),
    );
    players.push(
      { ...fixture("pitcher", "other"), teamId: teams[1].id },
      { ...fixture("pitcher", "dev"), registration: "development" },
    );
    const ids = players.slice(0, 27).map((p) => p.id),
      state = withIds(ids),
      before = JSON.stringify({ players, state });
    expect(validateBench(players, state, own, ids.slice(0, 26))).toEqual({
      ok: true,
    });
    rejected(validateBench(players, state, own, ids), /26人/);
    for (const [bad, reason] of [
      ["p27", /1軍/],
      ["other", /他球団/],
      ["dev", /1軍/],
      ["missing", /存在/],
    ] as const)
      rejected(validateBench(players, state, own, [bad]), reason);
    rejected(validateBench(players, state, own, [ids[0], ids[0]]), /重複/);
    expect(JSON.stringify({ players, state })).toBe(before);
  });
  it.each([0, 1, 2, 3, 4])(
    "外国人4人中の投手%i人の構成を正しく判定する",
    (pitchers) => {
      const players = Array.from({ length: 4 }, (_, i) =>
        fixture(i < pitchers ? "pitcher" : "fielder", `f${i}`, true),
      );
      const ids = players.map((p) => p.id),
        state = withIds(ids);
      expect(validateBench(players, state, own, ids).ok).toBe(
        pitchers > 0 && pitchers < 4,
      );
      expect(validateBench(players, state, own, ids.slice(0, 3)).ok).toBe(true);
    },
  );
  it("外国人5人の1軍登録は可能でもベンチ入り不可。免除者は4人判定に混ぜない", () => {
    const players = [
      fixture("pitcher", "p0", true),
      fixture("pitcher", "p1", true),
      fixture("fielder", "f0", true),
      fixture("fielder", "f1", true),
      fixture("fielder", "f2", true),
      fixture("pitcher", "exempt", true, 8),
    ];
    const ids = players.map((p) => p.id),
      state = withIds(ids);
    expect(validateRosterState(players, state).ok).toBe(true);
    rejected(validateBench(players, state, own, ids), /4人/);
    expect(
      validateBench(players, state, own, ["p0", "p1", "f0", "f1", "exempt"]).ok,
    ).toBe(true);
  });
});

it("枠満員でも8季完了者は登録可能で、ベンチの投野混合判定でも免除者を数えない", () => {
  const players = [
    ...Array.from({ length: 4 }, (_, i) => fixture("pitcher", `p${i}`, true)),
    fixture("fielder", "counted", true, 7),
    fixture("fielder", "exempt", true, 8),
  ];
  const state = withIds(["p0", "p1", "p2", "p3", "counted"]);
  const after = updated(registerFirstTeam(players, state, own, "exempt"));
  expect(foreignCounts(players).total).toBe(5);
  expect(
    validateBench(players, after, own, ["p0", "p1", "p2", "p3", "exempt"]).ok,
  ).toBe(false);
  expect(
    validateBench(players, after, own, ["p0", "p1", "p2", "counted", "exempt"])
      .ok,
  ).toBe(true);
});
