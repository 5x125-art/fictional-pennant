import { expect, it, vi } from "vitest";
import { simulateMatch, stealingProbabilities, type Bases, type MatchOptions, type StealCatcher, type StealRunner, type StealingDecision, type StealingContext } from "../game/match";
import { applyStealing, stealingCandidates, resolveStealing } from "../game/match/stealing";
import { EarnedRunReconstruction } from "../game/match/earnedRuns";
import { advanceRunners } from "../game/match/runners";
import { SeededRandom } from "../game/random/seededRandom";
import { fixedHalves, matchFixture, matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const input = matchFixture();
const catcher: StealCatcher = Object.freeze({id: "catcher", position: "C", arm: 50, throwing: 50, aptitude: 50});
const runner: StealRunner = {id: "a", speed: 50, stealing: 50};
const runners = new Map(["a","b","c"].map(id => [id, {...runner, id}]));
const hold = {action: "hold"} as const;
const game = (scripts: Parameters<typeof fixedHalves>[0], resolveStealing: NonNullable<MatchOptions["resolveStealing"]>, other: MatchOptions = {}) => simulateMatch(input, {...other, resolvePlateAppearance: fixedHalves(scripts), resolveStealing});
const only = (index: number, action: "safe" | "out"): NonNullable<MatchOptions["resolveStealing"]> => c => c.plateAppearanceIndex === index && c.before.inning===1 && c.before.half==="top" ? {action, runnerId: c.candidates[0].id} : hold;

it.each([1,2] as const)("%i塁から盗塁成功・盗塁死・不実施を独立遷移", from => {
  const bases: Bases = from===1 ? ["a",null,"c"] : ["b","a",null];
  for (const action of ["safe","out","hold"] as const) {
    const decision: StealingDecision = action === "hold" ? hold : {action, runnerId: "a"};
    const r = applyStealing(bases, 2, from, decision);
    expect(bases).toEqual(from===1 ? ["a",null,"c"] : ["b","a",null]);
    expect(r.outsRecorded).toBe(action === "out" ? 1 : 0);
    if (action === "safe") { expect(r.bases[from]).toBe("a"); expect(r.bases[from-1]).toBeNull(); }
    if (action === "out") expect(r.bases).not.toContain("a");
    if (action === "hold") expect(r.bases).toEqual(bases);
  }
});
it("全8塁状態×0〜2アウト×移動方向×結果で成立条件と走者保存", () => {
  for (let mask=0; mask<8; mask++) for (const outs of [0,1,2]) for (const from of [1,2] as const) for (const action of ["safe","out"] as const) {
    const bases: Bases = [mask&1 ? "a":null,mask&2 ? "b":null,mask&4 ? "c":null];
    const candidates = stealingCandidates(bases,outs,runners,catcher);
    expect(candidates.length).toBeLessThanOrEqual(1); // 空の二塁と二塁走者ありは同時成立しない。
    const id = bases[from-1] ?? "missing", legal = !!bases[from-1] && bases[from]===null;
    const move = () => applyStealing(bases,outs,from,{action,runnerId:id});
    if (!legal) { expect(move).toThrow(/成立条件/); continue; }
    const r = move();
    const completed = [...r.bases.filter(Boolean), ...r.movements.filter(m => m.to==="out").map(m => m.playerId)];
    expect(completed.sort()).toEqual([...bases.filter(Boolean)].sort());
    expect(new Set(completed).size).toBe(completed.length);
    expect(r.outsRecorded+outs).toBeLessThanOrEqual(3);
    expect(candidates.map(c => c.id)).toContain(id);
  }
});
it.each(["safe","out"] as const)("盗塁%sは打席・打順を消費せず同じ打者へ進む", action => {
  const r = game({"1-top":["walk","strikeout"]}, only(1,action));
  const e = r.stealingEvents.find(e => e.attempted)!;
  expect(e).toMatchObject({action, plateAppearanceIndex:1, battingOrderSlot:2, plateAppearanceCompleted:false, endedHalfInning:false, estimatedPitches:0});
  expect(e.before.nextBatterIndex).toEqual(e.after.nextBatterIndex);
  expect(r.events[1]).toMatchObject({batterId:e.batterId, index:1, battingOrderSlot:2});
  expect(r.events[1].before).toEqual(e.after);
  expect(r.battingByPlayerId[e.candidate!.id][action==="safe" ? "stolenBases" : "caughtStealing"]).toBe(1);
  expect(r.events[1].outsRecorded).toBe(1); // 打者に盗塁死のアウトを混ぜない。
  assertMatchAccounting(r);
});
it.each(["walk","double"] as const)("%s出塁後の盗塁死第3アウトは未完了打者を次回へ持ち越す", first => {
  const r = game({"1-top":[first,"strikeout","strikeout","homeRun"]}, only(3,"out"));
  const e = r.stealingEvents.find(e => e.endedHalfInning)!;
  expect(r.events.filter(e => e.inning===1 && e.half==="top")).toHaveLength(3);
  expect(e).toMatchObject({plateAppearanceIndex:3, battingOrderSlot:4, action:"out", after:{outs:3}, estimatedPitches:1});
  const next = r.events.find(e => e.inning===2 && e.half==="top")!;
  expect(next).toMatchObject({batterId:e.batterId, battingOrderSlot:4});
  expect(r.score.away).toBe(0);
  expect(r.pitchingByPlayerId[e.pitcherId].outs).toBe(36);
  const batterLogs = r.events.filter(log => log.batterId===e.batterId);
  expect(r.battingByPlayerId[e.batterId].plateAppearances).toBe(batterLogs.length);
  assertMatchAccounting(r);
});
it("盗塁成功後に同じ打席前の再盗塁をしない（最大1回）", () => {
  const r = game({"1-top":["walk","strikeout"]}, c => c.candidates.length ? {action:"safe",runnerId:c.candidates[0].id} : hold);
  const steals = r.stealingEvents.filter(e => e.before.inning===1 && e.before.half==="top");
  expect(steals.filter(e => e.plateAppearanceIndex===1)).toHaveLength(1);
  expect(r.events[1].before.bases[1]).toBe(r.events[0].batterId);
  expect(r.events[2].before.bases[2]).toBe(r.events[0].batterId);
  assertMatchAccounting(r);
});
it("不実施と候補なしを区別し、候補なしでは乱数を消費しない", () => {
  const rng = new SeededRandom(1), before = rng.getState();
  const context: StealingContext = {plateAppearanceIndex:0,before:{inning:1,half:"top",outs:0,bases:[null,null,null],score:{away:0,home:0},nextBatterIndex:{away:0,home:0}},batterId:"b",pitcherId:"p",catcher,candidates:[]};
  expect(resolveStealing(context,rng)).toEqual({action:"hold",candidate:null});
  expect(rng.getState()).toBe(before);
  const r = game({"1-top":["walk"]}, () => hold);
  expect(r.stealingEvents[0].reason).toBe("noEligibleRunner");
  expect(r.stealingEvents[1]).toMatchObject({reason:"hold", attempted:false, candidate:{from:1,to:2}});
  assertMatchAccounting(r);
});
it("走力と盗塁能力の個別効果、捕手の肩・送球・適性の個別効果", () => {
  const p = (r=runner,c=catcher) => stealingProbabilities(r,c,1,0);
  for (const ability of ["speed","stealing"] as const) {
    expect(p({...runner,[ability]:100}).attempt).toBeGreaterThan(p({...runner,[ability]:0}).attempt);
    expect(p({...runner,[ability]:100}).success).toBeGreaterThan(p({...runner,[ability]:0}).success);
  }
  for (const ability of ["arm","throwing","aptitude"] as const)
    expect(p(runner,{...catcher,[ability]:100}).success).toBeLessThan(p(runner,{...catcher,[ability]:0}).success);
  expect(stealingProbabilities(runner,catcher,2,0).attempt).toBeLessThan(p().attempt);
  expect(stealingProbabilities(runner,catcher,1,0,0).attempt).toBe(0);
  for (const speed of [0,100]) for (const stealing of [0,100]) for (const arm of [0,100]) for (const throwing of [0,100]) for (const aptitude of [0,100]) {
    expect(Object.values(p({...runner,speed,stealing},{...catcher,arm,throwing,aptitude})).every(v => Number.isFinite(v) && v>=0 && v<=1)).toBe(true);
  }
});
it("実スタメンのCが主位置と異なる場合も起用捕手を参照", () => {
  const order = input.home.battingOrder.map(e => ({...e, position:e.position==="C" ? "RF" as const : e.position==="RF" ? "C" as const : e.position}));
  const actualId = order.find(e => e.position==="C")!.playerId;
  const custom = {...input, home:{...input.home,battingOrder:order},players:input.players.map(p => p.kind==="fielder" ? {...p,positionAptitudes:{...p.positionAptitudes,C:80,RF:80}} : p)};
  const r = simulateMatch(custom,{resolvePlateAppearance:fixedHalves({"1-top":["walk"]}),resolveStealing:c => {
    if (c.before.half==="top") expect(c.catcher).toMatchObject({id:actualId,position:"C",aptitude:80});
    return hold;
  }});
  expect(r.stealingEvents[1].catcher.id).toBe(actualId);
  assertMatchAccounting(r);
});
it("失策走者の盗塁成功後も非自責、正規走者の盗塁成功→生還は自責", () => {
  for (const error of [false,true]) {
    const r = game({"1-top":[error ? "groundOut" : "walk","double"]},only(1,"safe"),{resolveDefense:c => error && c.eventIndex===0 ? "catchingError" : "none"});
    expect(r.score.away).toBe(1);
    expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed:1,earnedRuns:error ? 0 : 1});
    assertMatchAccounting(r);
  }
});
it("盗塁死を仮想アウトに加え、仮想第3アウト後の本塁打を非自責にする", () => {
  const r = game({"1-top":["groundOut","walk","strikeout","homeRun"]},c => {
    if (c.before.inning!==1 || c.before.half!=="top" || !c.candidates.length) return hold;
    return {action:c.plateAppearanceIndex===3 ? "out" : "safe",runnerId:c.candidates[0].id};
  },{resolveDefense:c => c.eventIndex===0 ? "catchingError" : "none"});
  expect(r.events[3].before.outs).toBe(2);
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed:2,earnedRuns:0});
  assertMatchAccounting(r);
});
it("失策走者の盗塁死は仮想走者を生成せず、後続の正規得点を自責にする", () => {
  const r = game({"1-top":["groundOut","homeRun"]},only(1,"out"),{resolveDefense:c => c.eventIndex===0 ? "catchingError" : "none"});
  expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({runsAllowed:1,earnedRuns:1});
  assertMatchAccounting(r);
});
it("出塁トークンを維持して一巡後の同じ選手と区別（再構成単体）", () => {
  const er = new EarnedRunReconstruction();
  er.record("error-token","a",advanceRunners([null,null,null],"a","reachedOnError"),"groundOut");
  er.recordStealing("a",1,2,"out");
  er.record("legitimate-token","a",advanceRunners([null,null,null],"a","walk"),"walk");
  er.recordStealing("a",1,2,"safe");
  er.record("hit-token","b",advanceRunners([null,"a",null],"b","double"),"double");
  expect(er.earnedRuns).toBe(1);
});
it("安打時走塁死は盗塁死へ加算しない", () => {
  const r = game({"1-top":["walk","single"]},() => hold,{resolveBaserunning:() => "out"});
  expect(r.events[1].outsRecorded).toBe(1);
  expect(r.battingByPlayerId[r.events[0].batterId]).toMatchObject({caughtStealing:0,stolenBases:0});
  assertMatchAccounting(r);
});
it.each([9,10,12])("%i回裏の盗塁成功後サヨナラは即終了し、余分な盗塁判断をしない", inning => {
  const r = game({[`${inning}-bottom`]:["walk","double"]},c => c.candidates.length ? {action:"safe",runnerId:c.candidates[0].id} : hold);
  expect(r.endReason).toBe("walkOff");
  expect(r.score.home).toBe(1);
  expect(r.timeline.at(-1)?.type).toBe("plateAppearance");
  assertMatchAccounting(r);
});
it("12回裏の盗塁死第3アウトで引分終了、未完了打席を捏造しない", () => {
  const r = game({"12-bottom":["walk","strikeout","strikeout","homeRun"]},c => c.before.inning===12 && c.before.half==="bottom" && c.before.outs===2 && c.candidates.length ? {action:"out",runnerId:c.candidates[0].id} : hold);
  expect(r.endReason).toBe("twelveInningDraw");
  expect(r.timeline.at(-1)).toMatchObject({type:"stealing",event:{endedHalfInning:true,plateAppearanceCompleted:false}});
  expect(r.finalState.outs).toBe(3);
  expect(r.events.at(-1)!.outcome).toBe("strikeout");
  assertMatchAccounting(r);
});
it("不正な注入結果・候補外の走者・非関数を明示拒否", () => {
  for (const decision of [null,undefined,[],"safe",{action:"steal"},{action:"safe"},{action:"out",runnerId:"missing"},{action:"hold",runnerId:"a"},{action:"safe",runnerId:"a",to:4},{action:"safe",runnerId:42}])
    expect(() => game({},() => decision as never)).toThrow(/盗塁/);
  expect(() => simulateMatch(input,{resolveStealing:true} as never)).toThrow(/オプション/);
});
it("不正状態・本盗・占有塁・異常能力を拒否", () => {
  for (const bases of [["a","a",null],[null,null], ["",null,null]])
    expect(() => applyStealing(bases as unknown as Bases,0,1,hold)).toThrow();
  for (const outs of [-1,3,NaN,0.5]) expect(() => applyStealing(["a",null,null],outs,1,hold)).toThrow();
  expect(() => applyStealing([null,null,"a"],0,3 as never,{action:"safe",runnerId:"a"})).toThrow();
  expect(() => applyStealing(["a","b",null],0,1,{action:"safe",runnerId:"a"})).toThrow();
  expect(() => stealingProbabilities({...runner,speed:NaN},catcher,1,0)).toThrow();
  expect(() => stealingProbabilities(runner,catcher,1,0,-1)).toThrow();
});
it("注入文脈は再帰的に凍結し、非公開情報・元選手を書き換えられない", () => {
  for (const mutate of [(c:StealingContext) => Object.assign(c.catcher,{arm:0}), (c:StealingContext) => Object.assign(c.before.nextBatterIndex,{away:8}), (c:StealingContext) => {if(c.candidates.length) Object.assign(c.candidates[0].probabilities,{success:1});}]) {
    expect(() => game({"1-top":["walk"]},c => {mutate(c);return hold;})).toThrow();
  }
});
it("同一シード再現・セーブ世界と正式乱数の非変更・Math.random不使用", () => {
  const before = JSON.stringify(matchFixtureWorld), source = JSON.stringify(input);
  const spy = vi.spyOn(Math,"random").mockImplementation(() => {throw Error("禁止");});
  try {
    const a = simulateMatch(input);
    expect(simulateMatch(input)).toEqual(a);
    expect(simulateMatch({...input,seed:input.seed+1})).not.toEqual(a);
    expect(a.engineVersion).toBe(6);
    expect(JSON.stringify(a)).not.toMatch(/growthType|abilityCaps|developmentByPlayerId/);
    expect(JSON.stringify(input)).toBe(source);
    expect(JSON.stringify(matchFixtureWorld)).toBe(before);
    assertMatchAccounting(a);
  } finally {spy.mockRestore();}
});
