import { expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { defenseFielder, defenseProbabilities, resolveDefense } from "../game/match/defense";
import { advanceRunners } from "../game/match/runners";
import { simulateMatch, type Bases, type DefenseAction, type MatchOptions, type PlateAppearanceOutcome } from "../game/match";
import { SeededRandom } from "../game/random/seededRandom";
import type { Fielder, FieldPosition } from "../game/players/types";
import { fieldPositions } from "../game/players/types";
import { matchFixture, fixedHalves } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const input = matchFixture();
const player = input.players.find(p => p.kind === "fielder") as Fielder;
const fielder = defenseFielder(player, "SS");
const fielders = new Map(fieldPositions.map(p => [p, {...fielder, position: p}]));
const game = (script: PlateAppearanceOutcome[], resolve: MatchOptions["resolveDefense"], inning = "1-top") => simulateMatch(input, {
  resolvePlateAppearance: fixedHalves({[inning]: script}), resolveDefense: resolve,
});
const errorAt = (index: number, kind: DefenseAction = "catchingError"): NonNullable<MatchOptions["resolveDefense"]> => c => c.eventIndex === index ? kind : "none";

it("捕球・送球・担当位置適性を個別に反映し、能力境界でも確率が有限", () => {
  const p = defenseProbabilities(fielder);
  expect(defenseProbabilities({...fielder, catching: 100}).hitPrevention).toBeGreaterThan(defenseProbabilities({...fielder, catching: 0}).hitPrevention);
  expect(defenseProbabilities({...fielder, aptitude: 100}).hitPrevention).toBeGreaterThan(defenseProbabilities({...fielder, aptitude: 0}).hitPrevention);
  expect(defenseProbabilities({...fielder, catching: 100}).catchingError).toBeLessThan(defenseProbabilities({...fielder, catching: 0}).catchingError);
  expect(defenseProbabilities({...fielder, throwing: 100}).throwingError).toBeLessThan(defenseProbabilities({...fielder, throwing: 0}).throwingError);
  expect(defenseProbabilities({...fielder, aptitude: 100}).throwingError).toBeLessThan(defenseProbabilities({...fielder, aptitude: 0}).throwingError);
  expect(p.hitPrevention).toBeGreaterThanOrEqual(0);
  for (const catching of [0, 100]) for (const throwing of [0,100]) for (const aptitude of [0,100]) {
    const ps = defenseProbabilities({...fielder, catching, throwing, aptitude});
    expect(Object.values(ps).every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    expect(ps.catchingError + ps.throwingError).toBeLessThan(1);
  }
  const altered = {...player, positionAptitudes: {...player.positionAptitudes, SS: 1, CF: 100}, abilities: {...player.abilities, arm: 0}};
  expect(defenseFielder(altered, "SS").aptitude).toBe(1);
  expect(defenseFielder(altered, "CF").aptitude).toBe(100);
  expect(defenseProbabilities(defenseFielder(altered, "CF"))).toEqual(defenseProbabilities(defenseFielder({...altered, abilities: {...altered.abilities, arm: 100}}, "CF")));
});
it("同じ打球・乱数で高守備ほど長期に安打阻止し失策が少ない", () => {
  const sample = (ability: number) => {
    const map = new Map(fieldPositions.map(p => [p, {...fielder, position: p, catching: ability, throwing: ability, aptitude: ability}]));
    const rng = new SeededRandom(881);
    let prevented = 0, errors = 0;
    for (let i = 0; i < 20000; i++) {
      prevented += Number(resolveDefense("single", map, rng, i).event!.hitPrevented);
      errors += Number(resolveDefense("groundOut", map, rng, i).event!.error);
    }
    return {prevented, errors};
  };
  const low = sample(1), high = sample(100);
  expect(high.prevented).toBeGreaterThan(low.prevented);
  expect(high.errors).toBeLessThan(low.errors);
});
it.each(["catchingError", "throwingError"] as const)("%sで担当野手の失策・打数・非安打を記録", kind => {
  const result = game(["groundOut"], errorAt(0, kind));
  const e = result.events[0], ds = result.fieldingByPlayerId[e.defense!.fielder.id];
  expect(e).toMatchObject({drawnOutcome: "groundOut", outcome: "reachedOnError", outsRecorded: 0, runsBattedIn: 0});
  expect(e.after.bases[0]).toBe(e.batterId);
  expect(e.defense!.errorPlayerId).toBe(e.defense!.fielder.id);
  const entry = input.home.battingOrder.find(l => l.position === e.defense!.fielder.position)!;
  expect(e.defense!.fielder.id).toBe(entry.playerId);
  expect(ds.errors).toBe(1);
  const bs = result.battingByPlayerId[e.batterId];
  expect(bs.atBats).toBe(bs.plateAppearances);
  expect(bs.hits + bs.walks + bs.hitByPitches).toBe(0);
  expect(result.pitchingByPlayerId[e.pitcherId].hitsAllowed).toBe(0);
  assertMatchAccounting(result);
});
it("全8塁状態の失策は押し出しのみ、走者を重複・消失させない", () => {
  for (let mask = 0; mask < 8; mask++) {
    const bases: Bases = [mask&1 ? "a":null, mask&2 ? "b":null, mask&4 ? "c":null];
    const error = advanceRunners(bases, "d", "reachedOnError");
    const walk = advanceRunners(bases, "d", "walk");
    expect(error.bases).toEqual(walk.bases);
    expect(error.scoredPlayerIds).toEqual(mask === 7 ? ["c"] : []);
    expect(error.outsRecorded).toBe(0);
    expect(new Set([...error.bases.filter(Boolean), ...error.scoredPlayerIds]).size).toBe(bases.filter(Boolean).length + 1);
  }
});
it("満塁失策の得点は打点なし、失策なし再構成で進まない走者は非自責", () => {
  const r = game(["walk", "walk", "walk", "groundOut", "strikeout", "strikeout"], errorAt(3));
  expect(r.score.away).toBe(1);
  expect(r.events[3].runsBattedIn).toBe(0);
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed: 1, earnedRuns: 0});
  assertMatchAccounting(r);
});
it("失策後の本塁打は失策走者だけ非自責、本塁打打者は自責", () => {
  const r = game(["groundOut", "homeRun"], errorAt(0));
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed: 2, earnedRuns: 1});
  assertMatchAccounting(r);
});
it("仮想第3アウト以降は本塁打でも非自責", () => {
  const r = game(["strikeout", "strikeout", "groundOut", "homeRun"], errorAt(2));
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed: 2, earnedRuns: 0});
  assertMatchAccounting(r);
});
it("三振・四死球・HR・併殺・犠飛・犠打には守備判定も乱数消費もない", () => {
  const callback = vi.fn(() => "none" as const), rng = new SeededRandom(11), before = rng.getState();
  for (const outcome of ["strikeout", "walk", "hitByPitch", "homeRun", "groundDoublePlay", "sacrificeFly", "sacrificeBunt"] as const)
    expect(resolveDefense(outcome, fielders, rng, 0, callback)).toEqual({outcome, event: null});
  expect(callback).not.toHaveBeenCalled();
  expect(rng.getState()).toBe(before);
});
it("安打阻止をアウトに変更し担当位置と成績へ記録", () => {
  const r = game(["single"], c => c.eventIndex === 0 ? "hitPrevented" : "none");
  expect(r.events[0].outsRecorded).toBe(1);
  expect(r.events[0].defense!.hitPrevented).toBe(true);
  expect(r.battingByPlayerId[r.events[0].batterId].hits).toBe(0);
  assertMatchAccounting(r);
});
it.each([9, 10, 12])("%i回裏の満塁失策サヨナラは1点・0打点で即時終了", inning => {
  const r = game(["walk", "walk", "walk", "groundOut", "homeRun"], c => c.drawnOutcome === "groundOut" && c.eventIndex === (inning-1)*6+6 ? "catchingError" : "none", `${inning}-bottom`);
  expect(r.endReason).toBe("walkOff");
  expect(r.score).toEqual({away: 0, home: 1});
  expect(r.events.at(-1)!.outcome).toBe("reachedOnError");
  expect(r.events.at(-1)!.runsBattedIn).toBe(0);
  assertMatchAccounting(r);
});
it("守備注入は不正結果を拒否し凍結DTOのみ渡す", () => {
  expect(() => game(["groundOut"], () => "hitPrevented")).toThrow(/成立条件/);
  expect(() => game(["single"], () => "catchingError")).toThrow(/成立条件/);
  expect(() => game(["flyOut"], () => "throwingError")).toThrow(/成立条件/);
  expect(() => game(["groundOut"], c => { (c.fielder as {catching: number}).catching = 0; return "none"; })).toThrow();
});
it("守備込みの同シード再現・入力の非変更・非公開データ排除", () => {
  const before = JSON.stringify(input);
  const r = simulateMatch(input);
  expect(simulateMatch(input)).toEqual(r);
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.stringify(r)).not.toMatch(/growthType|abilityCaps|developmentByPlayerId/);
  assertMatchAccounting(r);
});
it("守備のみ異なる編成で256シードを比較（打撃・投手能力は同一）", () => {
  const prepared = (ability: number) => ({...input, players: input.players.map(p => p.kind === "fielder" ? {
    ...p, abilities: {...p.abilities, catching: ability, throwing: ability},
    positionAptitudes: Object.fromEntries(fieldPositions.map(pos => [pos, ability])) as Record<FieldPosition, number>,
  } : p)});
  const sample = (ability: number) => {
    let hitsPrevented = 0, errors = 0, runs = 0;
    const team = prepared(ability);
    for (let seed=0; seed<256; seed++) {
      const r = simulateMatch({...team, seed});
      assertMatchAccounting(r);
      for (const stat of Object.values(r.fieldingByPlayerId)) { hitsPrevented += stat.hitsPrevented; errors += stat.errors; }
      runs += r.score.away + r.score.home;
    }
    return {ability, games: 256, hitsPrevented, errors, runsPerTeam: runs/512};
  };
  const low = sample(1), high = sample(100);
  expect(high.hitsPrevented).toBeGreaterThan(low.hitsPrevented);
  expect(high.errors).toBeLessThan(low.errors);
  expect(high.runsPerTeam).toBeLessThan(low.runsPerTeam);
  if (process.env.DEFENSE_COMPARISON_REPORT) writeFileSync(process.env.DEFENSE_COMPARISON_REPORT, JSON.stringify({low, high}, null, 2)+"\n");
}, 30000);

it("打者一巡後の同じ選手の出塁を区別して自責判定する", () => {
  const r = game(["groundOut", ...Array<"homeRun">(9).fill("homeRun")], errorAt(0));
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed: 10, earnedRuns: 9});
  assertMatchAccounting(r);
});
it("守備担当は打順の守備位置を参照し、主位置や別位置の適性を流用しない", () => {
  const custom = {...input, players: input.players.map(p => p.kind === "fielder" ? {
    ...p, positionAptitudes: Object.fromEntries(fieldPositions.map((pos, i) => [pos, i+1])) as Record<FieldPosition, number>,
  } : p)};
  let calls = 0, expectedTeam = input.home;
  const script = fixedHalves({"1-top": ["single", "flyOut"]});
  simulateMatch(custom, {resolvePlateAppearance: c => {
    expectedTeam = c.before.half === "top" ? input.home : input.away;
    return script(c);
  }, resolveDefense: c => {
    calls++;
    expect(expectedTeam.battingOrder.find(e => e.position === c.fielder.position)!.playerId).toBe(c.fielder.id);
    expect(c.fielder.aptitude).toBe(fieldPositions.indexOf(c.fielder.position) + 1);
    return "none";
  }});
  expect(calls).toBeGreaterThan(0);
});
it("ゴロは内野、フライ・長打性打球は内外野へ振り分ける", () => {
  const rng = new SeededRandom(781), flyPositions = new Set<string>();
  for (let i=0; i<200; i++) {
    const ground = resolveDefense("groundOut", fielders, rng, i, () => "none").event!;
    expect(["1B", "2B", "3B", "SS"]).toContain(ground.fielder.position);
    const fly = resolveDefense("double", fielders, rng, i, () => "none").event!;
    expect(fly.battedBall).toBe("fly");
    flyPositions.add(fly.fielder.position);
  }
  expect(flyPositions.has("SS") && flyPositions.has("CF")).toBe(true);
});
