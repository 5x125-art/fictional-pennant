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
      const legal = outs < 2 && (outcome === "groundDoublePlay" ? !!bases[0] : outcome === "sacrificeFly" ? !!bases[2] : mask !== 0);
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
  it.each(["sacrificeFly", "sacrificeBunt"] as const)("%sは打数を増やさず得点・打点と投手アウトを記録", outcome => {
    const result = game({"1-top": ["triple", outcome]});
    const e = result.events[1];
    const stats = result.battingByPlayerId[e.batterId];
    const logs = result.events.filter(log => log.batterId === e.batterId);
    expect(stats.atBats).toBe(logs.length - 1);
    expect(stats[outcome === "sacrificeFly" ? "sacrificeFlies" : "sacrificeBunts"]).toBe(1);
    expect(e).toMatchObject({outsRecorded: 1, runsBattedIn: 1, after: {outs: 1}});
    expect(result.battingByPlayerId[e.scoredPlayerIds[0]].runs).toBe(1);
    assertMatchAccounting(result);
  });
  it("犠打は満塁の各走者を1塁進める", () => {
    expect(advanceRunners(["a", "b", "c"], "d", "sacrificeBunt")).toMatchObject({bases: [null, "a", "b"], scoredPlayerIds: ["c"], outsRecorded: 1});
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
