import { assertMatchAccounting } from "./helpers/matchAssertions";
import { describe, expect, it, vi } from "vitest";
import { advanceRunners, isOut } from "../game/match/runners";
import { simulateMatch } from "../game/match/simulate";
import {
  outcomes,
  MatchSimulationError,
  type Bases,
} from "../game/match/types";
import { fixedHalves, matchFixture } from "./helpers/matchFixture";
const out = "groundOut" as const;
const game = (scripts: Parameters<typeof fixedHalves>[0]) =>
  simulateMatch(matchFixture(), {
    resolvePlateAppearance: fixedHalves(scripts),
  });
describe("走者移動（確率から独立）", () => {
  it.each([
    ["single", ["d", "c", "b"], ["a"]],
    ["double", [null, "d", "c"], ["a", "b"]],
    ["triple", [null, null, "d"], ["a", "b", "c"]],
    ["homeRun", [null, null, null], ["a", "b", "c", "d"]],
  ] as const)("満塁の%sで進塁と生還順を保つ", (outcome, expected, scored) => {
    // 一塁c、二塁b、三塁a。
    const result = advanceRunners(["c", "b", "a"], "d", outcome);
    expect(result.bases).toEqual(expected);
    expect(result.scoredPlayerIds).toEqual(scored);
  });
  it.each(["walk", "hitByPitch"] as const)(
    "%sは押し出し以外の非強制走者を動かさない",
    (outcome) => {
      expect(advanceRunners([null, "b", "c"], "d", outcome)).toMatchObject({
        bases: ["d", "b", "c"],
        scoredPlayerIds: [],
      });
      expect(advanceRunners(["a", null, "c"], "d", outcome)).toMatchObject({
        bases: ["d", "a", "c"],
        scoredPlayerIds: [],
      });
      expect(advanceRunners(["a", "b", "c"], "d", outcome)).toMatchObject({
        bases: ["d", "a", "b"],
        scoredPlayerIds: ["c"],
      });
    },
  );
  it("全8塁状態×9結果×サヨナラ条件で重複・消失・二重得点がない", () => {
    for (let mask = 0; mask < 8; mask++)
      for (const outcome of outcomes)
        for (const needed of [undefined, 1, 2, 3, 4]) {
          const bases: Bases = [
            mask & 1 ? "a" : null,
            mask & 2 ? "b" : null,
            mask & 4 ? "c" : null,
          ];
          const result = advanceRunners(bases, "d", outcome, needed);
          const completed = [
            ...result.bases.filter((id) => id !== null),
            ...result.scoredPlayerIds,
            ...(result.batterOut ? ["d"] : []),
          ];
          expect(new Set(completed).size).toBe(completed.length);
          expect(completed.sort()).toEqual(
            [...bases.filter((id) => id !== null), "d"].sort(),
          );
          if (isOut(outcome)) expect(result.bases).toEqual(bases);
          if (needed !== undefined && outcome !== "homeRun")
            expect(result.scoredPlayerIds.length).toBeLessThanOrEqual(needed);
        }
  });
  it("重複走者・不明な結果・不正な塁・必要点を拒否する", () => {
    expect(() =>
      advanceRunners([null, null, null], 42 as unknown as string, "single"),
    ).toThrow(MatchSimulationError);
    expect(() => advanceRunners(["a", "a", null], "d", out)).toThrow(
      MatchSimulationError,
    );
    expect(() => advanceRunners(["a", null, null], "a", out)).toThrow();
    expect(() =>
      advanceRunners([null, null, null], "d", "error" as never),
    ).toThrow();
    expect(() => advanceRunners([] as unknown as Bases, "d", out)).toThrow();
    expect(() => advanceRunners([null, null, null], "d", out, 0)).toThrow();
  });
});

describe("打席進行・勝敗", () => {
  it("全アウトなら3アウトで交代し打順を持ち越し、12回裏まで0対0で引き分ける", () => {
    const result = game({});
    expect(result.endReason).toBe("twelveInningDraw");
    expect(result.winnerTeamId).toBeNull();
    expect(result.events).toHaveLength(72);
    expect(result.innings).toHaveLength(12);
    expect(result.halfInnings).toHaveLength(24);
    expect(result.halfInnings.every((h) => h.outs === 3)).toBe(true);
    for (const half of ["top", "bottom"]) {
      const logs = result.events.filter((e) => e.half === half);
      expect(logs.map((e) => e.battingOrderSlot)).toEqual(
        Array.from({ length: 36 }, (_, i) => (i % 9) + 1),
      );
    }
    expect(
      result.events
        .filter((e) => e.inning === 10)
        .every((e) => e.before.bases.every((id) => id === null)),
    ).toBe(true);
    assertMatchAccounting(result);
  });
  it("9回表終了時に後攻が勝っていれば9回裏を実施しない", () => {
    const result = game({ "1-bottom": ["homeRun"] });
    expect(result.score).toEqual({ away: 0, home: 1 });
    expect(result.winnerTeamId).toBe(result.homeTeamId);
    expect(result.endReason).toBe("regulation");
    expect(result.innings[8].home).toBeNull();
    expect(result.halfInnings).toHaveLength(17);
    expect(
      result.events.some((e) => e.inning === 9 && e.half === "bottom"),
    ).toBe(false);
    expect(
      result.pitchingByPlayerId[matchFixture().home.startingPitcherId],
    ).toMatchObject({ wins: 1, outs: 27 });
    expect(
      result.pitchingByPlayerId[matchFixture().away.startingPitcherId],
    ).toMatchObject({ losses: 1, outs: 24 });
    assertMatchAccounting(result);
  });
  it("先攻リードでは9回裏を行い、追いつかなければ通常終了", () => {
    const result = game({ "1-top": ["homeRun"] });
    expect(result.endReason).toBe("regulation");
    expect(result.winnerTeamId).toBe(result.awayTeamId);
    expect(result.halfInnings).toHaveLength(18);
    assertMatchAccounting(result);
  });
  it.each([9, 10, 12])("%i回裏の勝越点で直ちに終了する", (inning) => {
    const result = game({ [`${inning}-bottom`]: ["triple", "single"] });
    expect(result.endReason).toBe("walkOff");
    expect(result.score).toEqual({ away: 0, home: 1 });
    expect(result.finalState).toMatchObject({
      inning,
      half: "bottom",
      outs: 0,
    });
    expect(result.halfInnings.at(-1)?.endedBy).toBe("walkOff");
    assertMatchAccounting(result);
  });
  it("非HRサヨナラは勝越点だけを数え、到達距離に合わせて安打を記録する", () => {
    const result = game({ "9-bottom": ["walk", "walk", "walk", "double"] }),
      event = result.events.at(-1)!;
    expect(result.score).toEqual({ away: 0, home: 1 });
    expect(event).toMatchObject({
      drawnOutcome: "double",
      outcome: "single",
      runsBattedIn: 1,
    });
    expect(result.battingByPlayerId[event.batterId].singles).toBe(1);
    assertMatchAccounting(result);
  });
  it.each(["homeRun", "walk", "hitByPitch"] as const)(
    "満塁サヨナラ%sの得点と打点を計上する",
    (outcome) => {
      const result = game({ "9-bottom": ["walk", "walk", "walk", outcome] });
      expect(result.score.home).toBe(outcome === "homeRun" ? 4 : 1);
      expect(result.events.at(-1)!.runsBattedIn).toBe(result.score.home);
      assertMatchAccounting(result);
    },
  );
  it("同点への追いつきはサヨナラではなく、延長の先攻勝利と12回同点を処理する", () => {
    const extended = game({
      "1-top": ["homeRun"],
      "9-bottom": ["homeRun"],
      "10-top": ["homeRun"],
    });
    expect(extended.endReason).toBe("extraInnings");
    expect(extended.innings).toHaveLength(10);
    expect(extended.score).toEqual({ away: 2, home: 1 });
    assertMatchAccounting(extended);
    const tie = game({ "12-top": ["homeRun"], "12-bottom": ["homeRun"] });
    expect(tie.endReason).toBe("twelveInningDraw");
    expect(tie.finalState).toMatchObject({
      inning: 12,
      half: "bottom",
      outs: 3,
    });
    assertMatchAccounting(tie);
  });
  it("全9結果を打撃・投手成績・構造化ログへ矛盾なく集計する", () => {
    const result = game({
      "1-top": [
        "single",
        "double",
        "triple",
        "homeRun",
        "walk",
        "hitByPitch",
        "strikeout",
        "groundOut",
        "flyOut",
      ],
    });
    expect(result.events.slice(0, 9).map((e) => e.outcome)).toEqual(outcomes);
    expect(result.events.slice(0, 9).map((e) => e.after.outs)).toEqual([
      0, 0, 0, 0, 0, 0, 1, 2, 3,
    ]);
    expect(
      Object.values(result.pitchingByPlayerId).every(
        (s) =>
          s.games === 1 && s.starts === 1 && s.saves === 0 && s.holds === 0,
      ),
    ).toBe(true);
    assertMatchAccounting(result);
  });
  it("アウトが出ない注入や不明なプレーは結果を捏造せず有限回で中断する", () => {
    expect(() =>
      simulateMatch(matchFixture(), { resolvePlateAppearance: () => "walk" }),
    ).toThrow(/安全上限/);
    expect(() =>
      simulateMatch(matchFixture(), {
        resolvePlateAppearance: () => "sacrificeFly" as never,
      }),
    ).toThrow(/未対応/);
  });
  it("同じシードは完全再現、別シードは変化し、元の能力・配列・所属を変えない", () => {
    const input = matchFixture(),
      before = JSON.stringify(input);
    const freeze = (value: unknown): void => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
      }
    };
    freeze(input);
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("Math.random禁止");
    });
    try {
      const a = simulateMatch(input),
        b = simulateMatch(input);
      expect(b).toEqual(a);
      expect(simulateMatch({ ...input, seed: input.seed + 1 })).not.toEqual(a);
      expect(a.random).toMatchObject({
        seed: input.seed,
        initialState: input.seed,
      });
      expect(a.random.finalState).not.toBe(input.seed);
      expect(JSON.stringify(input)).toBe(before);
      assertMatchAccounting(a);
    } finally {
      random.mockRestore();
    }
  });
  it("注入先には凍結したコピーだけを渡し、入力やログの状態を壊させない", () => {
    const input = matchFixture(),
      before = JSON.stringify(input);
    expect(() =>
      simulateMatch(input, {
        resolvePlateAppearance: (context) => {
          (context.batter.abilities as { power: number }).power = 0;
          return out;
        },
      }),
    ).toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });
});

it("未知の成長情報が現在能力へ混入しても、注入コールバック・結果に渡さない", () => {
  const input = structuredClone(matchFixture());
  for (const p of input.players) {
    Object.assign(p.abilities, {
      growthType: "late",
      abilityCaps: { power: 100 },
    });
    if (p.kind === "pitcher")
      for (const pitch of p.abilities.pitches)
        Object.assign(pitch, { growthType: "late" });
  }
  const result = simulateMatch(input, {
    resolvePlateAppearance: (context) => {
      expect(JSON.stringify(context)).not.toMatch(
        /growthType|abilityCaps|developmentByPlayerId/,
      );
      return "groundOut";
    },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /growthType|abilityCaps|developmentByPlayerId/,
  );
});
it("不正な判定オプションを拒否する", () =>
  expect(() =>
    simulateMatch(matchFixture(), { resolvePlateAppearance: false } as never),
  ).toThrow(/オプション/));
