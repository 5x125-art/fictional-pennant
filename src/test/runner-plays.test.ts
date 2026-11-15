import { describe, expect, it } from "vitest";
import { advanceRunners } from "../game/match/runners";
import { simulateMatch } from "../game/match";
import type { Bases } from "../game/match";
import { fixedHalves, matchFixture } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const game = (scripts: Parameters<typeof fixedHalves>[0]) => simulateMatch(matchFixture(), {
  resolvePlateAppearance: fixedHalves(scripts),
});
const special = ["groundDoublePlay", "sacrificeFly", "sacrificeBunt"] as const;
describe("Phase 3B-1走者プレー", () => {
  it("全塁状態・アウト・結果で成立条件と走者保存を検証", () => {
    for (let mask = 0; mask < 8; mask++) for (let outs = 0; outs < 3; outs++) for (const outcome of special) {
      const bases: Bases = [mask & 1 ? "a" : null, mask & 2 ? "b" : null, mask & 4 ? "c" : null];
      const legal = outs < 2 && (outcome === "groundDoublePlay" ? !!bases[0] : outcome === "sacrificeFly" ? !!bases[2] : mask !== 0 && bases[2] === null);
      const run = () => advanceRunners(bases, "d", outcome, undefined, outs);
      if (!legal) { expect(run).toThrow(); continue; }
      const moved = run();
      expect(moved.movements.map(m => m.playerId).sort()).toEqual([...bases.filter(id => id !== null), "d"].sort());
      const completed = [...moved.bases.filter(id => id !== null), ...moved.scoredPlayerIds, ...moved.movements.filter(m => m.to === "out").map(m => m.playerId)];
      expect(new Set(completed).size).toBe(completed.length);
      expect(completed.sort()).toEqual([...bases.filter(id => id !== null), "d"].sort());
      for (const movement of moved.movements) {
        expect(movement.from).toBe(movement.playerId === "d" ? 0 : bases.indexOf(movement.playerId) + 1);
        if (typeof movement.to === "number") expect(moved.bases[movement.to - 1]).toBe(movement.playerId);
        if (movement.to === "score") expect(moved.scoredPlayerIds).toContain(movement.playerId);
      }
      expect(moved.outsRecorded).toBe(outcome === "groundDoublePlay" ? 2 : 1);
      expect(outs + moved.outsRecorded).toBeLessThanOrEqual(3);
      if (outcome === "groundDoublePlay") expect(moved.scoredPlayerIds).toEqual([]);
      expect(bases).toEqual([mask & 1 ? "a" : null, mask & 2 ? "b" : null, mask & 4 ? "c" : null]);
    }
  });
  it("満塁・1アウトの併殺で第3アウト、得点なしで交代し打順を継続", () => {
    const result = game({"1-top": ["walk", "walk", "walk", "strikeout", "groundDoublePlay", "homeRun"]});
    const top = result.events.filter(e => e.inning === 1 && e.half === "top");
    expect(top).toHaveLength(5);
    const dp = top.at(-1)!;
    expect(dp).toMatchObject({outsRecorded: 2, runsBattedIn: 0, scoredPlayerIds: [], after: {outs: 3}});
    expect(dp.movements.filter(m => m.to === "out").map(m => m.outKind)).toEqual(["force", "batter"]);
    expect(result.innings[0].away).toBe(0);
    expect(result.events.find(e => e.inning === 2 && e.half === "top")!.battingOrderSlot).toBe(6);
    assertMatchAccounting(result);
  });
  it("0アウトの併殺は2アウトに留まり次打者が打てる", () => {
    const result = game({"1-top": ["single", "groundDoublePlay", "homeRun"]});
    expect(result.events[1].after.outs).toBe(2);
    expect(result.innings[0].away).toBe(1);
    assertMatchAccounting(result);
  });
  it("犠飛は打数を増やさず得点・打点と投手アウトを記録", () => {
    const outcome = "sacrificeFly" as const;
    const result = game({"1-top": ["triple", outcome]});
    const e = result.events[1];
    const stats = result.battingByPlayerId[e.batterId];
    const logs = result.events.filter(log => log.batterId === e.batterId);
    expect(stats.atBats).toBe(logs.length - 1);
    expect(stats.sacrificeFlies).toBe(1);
    expect(e).toMatchObject({outsRecorded: 1, runsBattedIn: 1, after: {outs: 1}});
    expect(result.battingByPlayerId[e.scoredPlayerIds[0]].runs).toBe(1);
    assertMatchAccounting(result);
  });
  it.each([0, 1])("%iアウトで三塁が空の送りバントは打数を増やさず進塁・犠打・投手アウトを記録", outs => {
    const script = ["single", "single", ...Array<"strikeout">(outs).fill("strikeout"), "sacrificeBunt"] as const;
    const result = game({"1-top": [...script]});
    const event = result.events[script.length - 1];
    const [first, second] = event.before.bases;
    expect(event).toMatchObject({
      outcome: "sacrificeBunt", outsRecorded: 1, scoredPlayerIds: [], runsBattedIn: 0,
      after: {outs: outs + 1, bases: [null, first, second]},
    });
    expect(event.movements).toEqual([
      {playerId: first, from: 1, to: 2},
      {playerId: second, from: 2, to: 3},
      {playerId: event.batterId, from: 0, to: "out", outKind: "batter"},
    ]);
    const stats = result.battingByPlayerId[event.batterId];
    const logs = result.events.filter(e => e.batterId === event.batterId);
    expect(stats).toMatchObject({plateAppearances: logs.length, atBats: logs.length - 1, sacrificeBunts: 1, runsBattedIn: 0});
    expect(result.pitchingByPlayerId[event.pitcherId].outs).toBe(
      result.events.filter(e => e.pitcherId === event.pitcherId).reduce((n,e) => n + e.outsRecorded, 0),
    );
    expect(result.score.away).toBe(0);
    assertMatchAccounting(result);
  });
  it.each([0, 1])("%iアウトで三塁走者がいる全塁状態の犠打を明示的に拒否", outs => {
    for (const bases of [[null, null, "c"], ["a", null, "c"], [null, "b", "c"], ["a", "b", "c"]] as const) {
      const before = [...bases];
      expect(() => advanceRunners(bases, "d", "sacrificeBunt", undefined, outs)).toThrow(/スクイズは未実装/);
      expect(bases).toEqual(before);
    }
    expect(() => game({"1-top": ["triple", ...Array<"strikeout">(outs).fill("strikeout"), "sacrificeBunt"]})).toThrow(/スクイズは未実装/);
    expect(() => game({"1-top": ["walk", "walk", "walk", ...Array<"strikeout">(outs).fill("strikeout"), "sacrificeBunt"]})).toThrow(/スクイズは未実装/);
  });
  it.each([9, 10, 12])("%i回裏の犠飛サヨナラで即時終了", inning => {
    const result = game({[`${inning}-bottom`]: ["triple", "sacrificeFly", "homeRun"]});
    expect(result.endReason).toBe("walkOff");
    expect(result.score).toEqual({away: 0, home: 1});
    expect(result.events.at(-1)!.outcome).toBe("sacrificeFly");
    assertMatchAccounting(result);
  });
  it.each(special)("2アウトから%sを注入すると拒否", outcome => {
    expect(() => game({"1-top": ["walk", "walk", "walk", "strikeout", "strikeout", outcome]})).toThrow(/成立条件/);
  });
  it("不正アウト数を拒否", () => {
    for (const outs of [-1, 3, 0.5, NaN]) expect(() => advanceRunners([null,null,null], "b", "groundOut", undefined, outs)).toThrow();
  });
});
