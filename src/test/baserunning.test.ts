import { describe, expect, it, vi } from "vitest";
import { advanceOnHit, baserunningProbabilities, resolveBaserunning } from "../game/match/baserunning";
import { advanceRunners, scoredBeforeThirdOut } from "../game/match/runners";
import { simulateMatch, type Bases, type BaserunningContext, type BaserunningAction, type ExtraAdvanceEvent, type MatchOptions, type PlateAppearanceOutcome, type ThrowingFielder } from "../game/match";
import { SeededRandom } from "../game/random/seededRandom";
import { fixedHalves, matchFixture } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const fielder: ThrowingFielder = Object.freeze({id: "rf", position: "RF", arm: 50, throwing: 50, aptitude: 50});
const context: BaserunningContext = {eventIndex: 0, runnerId: "a", from: 1, target: 3, outcome: "single", outs: 0, battedBall: "ground", speed: 50, fielder};
const decision = (action: BaserunningAction, runnerId = "a", from: 1 | 2 = 1, target: 3 | "score" = 3): ExtraAdvanceEvent => ({...context, runnerId, from, target, action, attempted: action !== "hold", outPlayerId: action === "out" ? runnerId : null, probabilities: baserunningProbabilities(context)});
const input = matchFixture();
const run = (script: readonly PlateAppearanceOutcome[], resolveBaserunning: MatchOptions["resolveBaserunning"], half = "1-top", resolveDefense?: MatchOptions["resolveDefense"]) => simulateMatch(input, {
  resolvePlateAppearance: fixedHalves({[half]: script}), resolveBaserunning, resolveDefense,
});
const actions = ["hold", "safe", "out"] as const;
const extras = (r: ReturnType<typeof simulateMatch>) => r.events.flatMap(e => e.movements.flatMap(m => m.extraAdvance ? [m.extraAdvance] : []));

describe("追加進塁・送球", () => {
  it.each([
    [["a", null, null], "single", ["d", null, "a"], [], 3],
    [[null, "a", null], "single", ["d", null, null], ["a"], "score"],
    [["a", null, null], "double", [null, "d", null], ["a"], "score"],
  ] as const)("%jの%sで追加進塁成功", (bases, outcome, expected, scored, target) => {
    const r = advanceOnHit(bases, "d", outcome, 0, undefined, (id, from, to) => decision("safe", id, from, to));
    expect(r.bases).toEqual(expected);
    expect(r.scoredPlayerIds).toEqual(scored);
    expect(r.movements.find(m => m.playerId === "a")?.extraAdvance).toMatchObject({target, action: "safe", attempted: true});
  });
  it.each(actions)("全塁状態×アウト数×安打×必要点で走者保存（%s）", action => {
    for (let mask=0; mask<8; mask++) for (let outs=0; outs<3; outs++) for (const outcome of ["single", "double"] as const) for (const needed of [undefined, 1, 2, 3]) {
      const bases: Bases = [mask&1 ? "a":null, mask&2 ? "b":null, mask&4 ? "c":null];
      const r = advanceOnHit(bases, "d", outcome, outs, needed, (id, from, to) => decision(action, id, from, to));
      const completed = [...r.bases.filter(Boolean), ...r.scoredPlayerIds, ...r.movements.filter(m => m.to === "out").map(m => m.playerId)];
      expect(completed.sort()).toEqual([...bases.filter(Boolean), "d"].sort());
      expect(new Set(completed).size).toBe(completed.length);
      expect(outs+r.outsRecorded).toBeLessThanOrEqual(3);
      expect(r.movements).toHaveLength(bases.filter(Boolean).length+1);
      for (const m of r.movements) {
        if (typeof m.to === "number") expect(r.bases[m.to-1]).toBe(m.playerId);
        if (m.extraAdvance?.action === "out") expect(m).toMatchObject({to: "out", outKind: "tag"});
      }
      if (needed !== undefined) expect(r.scoredPlayerIds.length).toBeLessThanOrEqual(needed);
      if (action === "hold") {
        const basic = advanceRunners(bases, "d", outcome, needed, outs);
        expect(r.bases).toEqual(basic.bases);
        expect(r.scoredPlayerIds).toEqual(basic.scoredPlayerIds);
      }
    }
  });
  it("先行走者が三塁に留まると後続は三塁を狙わない", () => {
    const callback = vi.fn((id: string, from: 1 | 2, to: 3 | "score") => decision("hold", id, from, to));
    const r = advanceOnHit(["a", "b", null], "d", "single", 0, undefined, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(r.bases).toEqual(["d", "a", "b"]);
    expect(r.movements[0]).toMatchObject({advanceBlocked: "occupied"});
  });
  it("先行走者生還後に後続も三塁を狙える", () => {
    const r = advanceOnHit(["a", "b", null], "d", "single", 0, undefined, (id, from, to) => decision("safe", id, from, to));
    expect(r.scoredPlayerIds).toEqual(["b"]);
    expect(r.bases).toEqual(["d", null, "a"]);
  });
  it("二死で先行走者が本塁アウトなら後続の追加進塁判定を行わない", () => {
    const callback = vi.fn((id: string, from: 1 | 2, to: 3 | "score") => decision("out", id, from, to));
    const r = advanceOnHit(["a", "b", "c"], "d", "single", 2, undefined, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(r.scoredPlayerIds).toEqual(["c"]);
    expect(r.movements[0]).toMatchObject({advanceBlocked: "thirdOut", to: 2});
    expect(r.playSequence).toEqual([{playerId: "c", type: "score"}, {playerId: "b", type: "out", outKind: "tag"}]);
  });
  it("同プレーで複数走者アウトでも3アウトを超えない", () => {
    for (const outs of [0, 1, 2]) {
      const r = advanceOnHit(["a", "b", null], "d", "single", outs, undefined, (id, from, to) => decision("out", id, from, to));
      expect(r.outsRecorded).toBe(outs === 2 ? 1 : 2);
    }
  });
  it("走力・肩力・スローイング・当該位置適性と状況を別々に反映", () => {
    const p = baserunningProbabilities;
    expect(p({...context, speed: 100}).attempt).toBeGreaterThan(p({...context, speed: 0}).attempt);
    expect(p({...context, speed: 100}).out).toBeLessThan(p({...context, speed: 0}).out);
    for (const ability of ["arm", "throwing", "aptitude"] as const) {
      expect(p({...context, fielder: {...fielder, [ability]: 100}}).out).toBeGreaterThan(p({...context, fielder: {...fielder, [ability]: 0}}).out);
    }
    expect(p({...context, outs: 2}).attempt).toBeGreaterThan(p(context).attempt);
    expect(p({...context, battedBall: "fly"})).not.toEqual(p(context));
    for (const speed of [0,100]) for (const arm of [0,100]) for (const throwing of [0,100]) for (const aptitude of [0,100]) {
      expect(Object.values(p({...context, speed, fielder: {...fielder, arm, throwing, aptitude}})).every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    }
  });
  it("試行を同じにした送球試験で高肩力は走塁死が増え、高走力は減る", () => {
    const sample = (speed: number, arm: number) => {
      const rng = new SeededRandom(829), p = baserunningProbabilities({...context, speed, fielder: {...fielder, arm}});
      let attempted = 0, out = 0, safe = 0;
      for (let i=0; i<20000; i++) {
        const attemptRoll = rng.next(), outRoll = rng.next();
        if (attemptRoll < p.attempt) { attempted++; if (outRoll < p.out) out++; else safe++; }
      }
      return {attempted, outRate: out/attempted, safe};
    };
    expect(sample(100,50).safe).toBeGreaterThan(sample(0,50).safe);
    expect(sample(100,50).outRate).toBeLessThan(sample(0,50).outRate);
    expect(sample(50,100).outRate).toBeGreaterThan(sample(50,0).outRate);
  });
});

it.each(["single", "double"] as const)("%sで走塁死しても打者安打・打数・投手被安打を維持", outcome => {
  const r = run(["walk", outcome], () => "out");
  const e = r.events[1], m = e.movements.find(m => m.extraAdvance)!;
  expect(e).toMatchObject({outcome, outsRecorded: 1, scoredPlayerIds: []});
  expect(m).toMatchObject({to: "out", outKind: "tag", extraAdvance: {attempted: true, outPlayerId: r.events[0].batterId}});
  expect(r.battingByPlayerId[e.batterId].hits).toBe(1);
  expect(r.pitchingByPlayerId[e.pitcherId].hitsAllowed).toBe(1);
  assertMatchAccounting(r);
});
it("走塁死の第3アウトで次打席を実行せず、次回の打順へ持ち越す", () => {
  const r = run(["walk", "strikeout", "strikeout", "single", "homeRun"], () => "out");
  expect(r.events.filter(e => e.inning===1 && e.half==="top")).toHaveLength(4);
  expect(r.events[3].after.outs).toBe(3);
  expect(r.events.find(e => e.inning===2 && e.half==="top")!.battingOrderSlot).toBe(5);
  expect(r.events[4].half).toBe("bottom");
  assertMatchAccounting(r);
});
it("三塁走者生還→二塁走者本塁タッグ第3アウトは1得点・1打点・1自責", () => {
  const r = run(["walk", "walk", "walk", "strikeout", "strikeout", "single", "homeRun"], () => "out");
  const e = r.events[5];
  expect(e).toMatchObject({runsBattedIn: 1, outsRecorded: 1, after: {outs: 3}});
  expect(e.scoredPlayerIds).toEqual([r.events[0].batterId]);
  expect(r.pitchingByPlayerId[e.pitcherId]).toMatchObject({runsAllowed: 1, earnedRuns: 1});
  assertMatchAccounting(r);
});
it("第3アウト前後の得点をタッグ／フォース／打者アウトで裁定", () => {
  for (const outKind of ["tag", "force", "batter"] as const) {
    expect(scoredBeforeThirdOut([{playerId: "a", type: "score"}, {playerId: "b", type: "out", outKind}, {playerId: "c", type: "score"}], 2)).toEqual(outKind === "tag" ? ["a"] : []);
  }
});
it.each([9,10,12])("%i回裏の追加進塁サヨナラは勝越点で止まり後続の送球死も発生しない", inning => {
  const r = run(["walk", "walk", "single", "homeRun"], () => "safe", `${inning}-bottom`);
  expect(r.endReason).toBe("walkOff");
  expect(r.score).toEqual({away: 0, home: 1});
  const e = r.events.at(-1)!;
  expect(e.outcome).toBe("single");
  expect(e.movements.find(m => m.from===1)).toMatchObject({to: 2, advanceBlocked: "walkOff"});
  assertMatchAccounting(r);
});
it("二塁打による本塁追加進塁サヨナラは二塁打を保ち1点で止める", () => {
  const r = run(["walk", "double", "homeRun"], () => "safe", "9-bottom");
  expect(r.events.at(-1)).toMatchObject({outcome: "double", runsBattedIn: 1});
  expect(r.endReason).toBe("walkOff");
  assertMatchAccounting(r);
});
it("実スタメンの起用位置から外野送球担当・肩力・スローイング・適性をログへ保持", () => {
  const r = run(["walk", "walk", "single"], c => {
    const entry = input.home.battingOrder.find(e => e.position===c.fielder.position)!;
    const p = input.players.find(p => p.id===entry.playerId)!;
    expect(p.kind).toBe("fielder");
    if (p.kind === "fielder") {
      expect(c.fielder).toMatchObject({id: p.id, arm: p.abilities.arm, throwing: p.abilities.throwing, aptitude: p.positionAptitudes[entry.position as "LF"]});
    }
    return "safe";
  }, "1-top", () => "none");
  expect(extras(r)).toHaveLength(2);
  expect(extras(r)[0].fielder).toEqual(extras(r)[1].fielder);
  const event = r.events[2];
  if (["LF","CF","RF"].includes(event.defense!.fielder.position)) expect(extras(r)[0].fielder.id).toBe(event.defense!.fielder.id);
  assertMatchAccounting(r);
});
it("不正な走塁注入・オプションを明示拒否し、凍結コピーを維持", () => {
  for (const action of ["force", "steal", null, {}, true, undefined]) expect(() => run(["walk", "single"], () => action as never)).toThrow(/走塁注入/);
  expect(() => simulateMatch(input, {resolveBaserunning: true} as never)).toThrow(/オプション/);
  for (const mutate of [(c: BaserunningContext) => Object.assign(c, {speed: 0}), (c: BaserunningContext) => Object.assign(c.fielder, {arm: 0})]) {
    expect(() => run(["walk", "single"], c => { mutate(c); return "safe"; })).toThrow();
  }
});
it("安打阻止・失策には追加進塁判定を適用しない", () => {
  const callback = vi.fn(() => "safe" as const);
  const r = run(["walk", "single", "groundOut"], callback, "1-top", c => c.eventIndex === 1 ? "hitPrevented" : c.eventIndex === 2 ? "catchingError" : "none");
  expect(callback).not.toHaveBeenCalled();
  assertMatchAccounting(r);
});
it("失策走者の追加生還は非自責、続く安打走者の追加生還は自責", () => {
  const r = run(["groundOut", "double", "double"], () => "safe", "1-top", c => c.eventIndex===0 ? "catchingError" : "none");
  expect(r.score.away).toBe(2);
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({earnedRuns: 1, runsAllowed: 2});
  assertMatchAccounting(r);
});
it("走塁死を失策なし再構成へ反映し、仮想第3アウト後の実得点を非自責にする", () => {
  const r = run(["groundOut", "walk", "double", "strikeout", "homeRun"], () => "out", "1-top", c => c.eventIndex===0 ? "catchingError" : "none");
  expect(r.events[2].outsRecorded).toBe(1);
  // 二塁打で失策走者が生還、正規走者は走塁死。次の三振で仮想3アウト。
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({earnedRuns: 0, runsAllowed: 3});
  assertMatchAccounting(r);
});
it("同シード再現・入力と正式世界の非変更・Math.random不使用", () => {
  const before = JSON.stringify(input);
  const spy = vi.spyOn(Math, "random").mockImplementation(() => {throw Error("禁止");});
  try {
    const a = simulateMatch(input), b = simulateMatch(input);
    expect(a).toEqual(b);
    expect(a.engineVersion).toBe(5);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(a)).not.toMatch(/growthType|abilityCaps|developmentByPlayerId/);
    expect(extras(a).length).toBeGreaterThan(0);
    assertMatchAccounting(a);
  } finally { spy.mockRestore(); }
});
it("対象走者なし・対象外結果は走塁乱数も注入も消費しない", () => {
  const rng = new SeededRandom(1), before = rng.getState(), callback = vi.fn(() => "safe" as const);
  for (const outcome of ["single", "double", "homeRun", "walk", "groundOut"] as const) {
    resolveBaserunning([null,null,null], "d", outcome, 0, undefined, new Map(), new Map(), null, rng, 0, callback);
  }
  expect(rng.getState()).toBe(before);
  expect(callback).not.toHaveBeenCalled();
});
it("主守備位置を入れ替えても実際の起用位置の選手が外野送球する", () => {
  const custom = {...input, players: input.players.map(p => p.kind === "fielder" ? {
    ...p, primaryPosition: p.primaryPosition === "LF" ? "RF" as const : p.primaryPosition === "RF" ? "LF" as const : p.primaryPosition,
  } : p)};
  let calls = 0;
  simulateMatch(custom, {resolvePlateAppearance: fixedHalves({"1-top": ["walk", "single"]}), resolveBaserunning: c => {
    const entry = custom.home.battingOrder.find(e => e.position === c.fielder.position)!;
    expect(c.fielder.id).toBe(entry.playerId);
    calls++;
    return "hold";
  }});
  expect(calls).toBe(1);
});
it("サヨナラ点が通常進塁で入ると以降の追加進塁を抽選しない", () => {
  const decide = vi.fn((id: string, from: 1 | 2, to: 3 | "score") => decision("out",id,from,to));
  const r = advanceOnHit(["a","b","c"], "d", "single", 2, 1, decide);
  expect(decide).not.toHaveBeenCalled();
  expect(r.scoredPlayerIds).toEqual(["c"]);
  expect(r.movements.find(m => m.playerId === "b")).toMatchObject({extraAdvanceTarget: "score", extraAdvanceAttempted: false, advanceBlocked: "walkOff"});
  expect(r.outsRecorded).toBe(0);
});
