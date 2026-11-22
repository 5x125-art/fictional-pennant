import { expect, it, vi } from "vitest";
import { pitcherFatigue, applyPitcherFatigue, pitcherFatigueState, simulateMatch, outcomeProbabilities, drawPlateAppearance, type MatchPitcher } from "../game/match";
import { matchPitcher, matchBatter } from "../game/match/validate";
import type { Pitcher, Fielder } from "../game/players/types";
import { SeededRandom } from "../game/random/seededRandom";
import { matchFixture, matchFixtureWorld, fixedHalves } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const input = matchFixture();
const base = matchPitcher(input.players.find(p => p.id === input.home.startingPitcherId) as Pitcher);
const batter = matchBatter(input.players.find(p => p.id === input.away.battingOrder[0].playerId) as Fielder);

it.each([0,50,100])("スタミナ%iでも初期疲労0、球数で単調増加・上限100", stamina => {
  expect(pitcherFatigue(stamina,0)).toMatchObject({pitches:0,fatigue:0,stage:0,stamina});
  let fatigue=0;
  for (let pitches=0;pitches<=400;pitches++) {
    const f=pitcherFatigue(stamina,pitches);
    expect(f.fatigue).toBeGreaterThanOrEqual(fatigue);
    expect(f.fatigue).toBeLessThanOrEqual(100);
    expect(Number.isFinite(f.fatigue)).toBe(true);
    expect(Number.isInteger(f.stage) && f.stage>=0 && f.stage<=4).toBe(true);
    fatigue=f.fatigue;
  }
  expect(pitcherFatigue(stamina,400).fatigue).toBe(100);
});
it("高スタミナほど開始が遅く、同じ球数なら低疲労", () => {
  expect(pitcherFatigue(100,100).fatigue).toBe(0);
  expect(pitcherFatigue(0,100).fatigue).toBeGreaterThan(90);
  for(let pitches=0;pitches<=250;pitches++) expect(pitcherFatigue(100,pitches).fatigue).toBeLessThanOrEqual(pitcherFatigue(0,pitches).fatigue);
});
it("段階ごとに能力を補正し、基礎スタミナ・適性・変化量を維持", () => {
  expect(applyPitcherFatigue(base,0)).toEqual(base);
  const tired=applyPitcherFatigue(base,100);
  expect(tired.abilities.velocityKmh).toBe(base.abilities.velocityKmh-4);
  expect(tired.abilities.control).toBe(base.abilities.control-10);
  for(let i=0;i<tired.abilities.pitches.length;i++) {
    expect(tired.abilities.pitches[i]).toMatchObject({power:base.abilities.pitches[i].power-8,control:base.abilities.pitches[i].control-10,movement:base.abilities.pitches[i].movement});
  }
  expect(tired.abilities.stamina).toBe(base.abilities.stamina);
  expect(tired.abilities.starterSuitability).toBe(base.abilities.starterSuitability);
  expect(tired.abilities.reliefSuitability).toBe(base.abilities.reliefSuitability);
  expect(applyPitcherFatigue(base,1)).toEqual(applyPitcherFatigue(base,25));
  expect(applyPitcherFatigue(base,25)).not.toEqual(applyPitcherFatigue(base,25.001));
});
it("能力下限・全球種の正常範囲を維持し、低下を重ね掛けしない", () => {
  const minimum:MatchPitcher={...base,abilities:{...base.abilities,velocityKmh:1,control:0,stamina:0,pitches:base.abilities.pitches.map(p=>({...p,power:0,control:0,movement:0}))}};
  const a=applyPitcherFatigue(minimum,100).abilities;
  expect(a.velocityKmh).toBe(1);expect(a.control).toBe(0);
  expect(a.pitches.every(p=>p.power===0 && p.control===0 && p.movement===0)).toBe(true);
  expect(pitcherFatigueState(base,300).effectivePitcher).toEqual(pitcherFatigueState(base,200).effectivePitcher);
  expect(pitcherFatigue(100,Number.MAX_SAFE_INTEGER).fatigue).toBe(100);
});
it("固定疲労0／100で四球・被安打増、奪三振減を個別確認", () => {
  const fresh=applyPitcherFatigue(base,0),tired=applyPitcherFatigue(base,100);
  const p=outcomeProbabilities(batter,fresh,fresh.abilities.pitches[0]), q=outcomeProbabilities(batter,tired,tired.abilities.pitches[0]);
  expect(q.walk).toBeGreaterThan(p.walk);expect(q.strikeout).toBeLessThan(p.strikeout);
  const hits=(x:typeof p)=>x.single+x.double+x.triple+x.homeRun;
  expect(hits(q)).toBeGreaterThan(hits(p));
  for(const fatigue of [0,1,25,50,75,100]) {
    const pitcher=applyPitcherFatigue(base,fatigue);
    for(const pitch of pitcher.abilities.pitches) {
      const probabilities=outcomeProbabilities(batter,pitcher,pitch);
      expect(Object.values(probabilities).every(v=>Number.isFinite(v)&&v>=0)).toBe(true);
      expect(Object.values(probabilities).reduce((a,b)=>a+b,0)).toBeCloseTo(1,12);
    }
  }
});
it("疲労後の能力境界でも全確率が非負・合計1", () => {
  for(const ability of [0,100]) for(const velocity of [1,300]) for(const fatigue of [0,25,100]) {
    const p=applyPitcherFatigue({...base,abilities:{...base.abilities,velocityKmh:velocity,control:ability,pitches:base.abilities.pitches.map(p=>({...p,power:ability,control:ability,movement:ability===0?0:7}))}},fatigue);
    const b={...batter,abilities:{...batter.abilities,contactVsRight:ability,contactVsLeft:ability,power:ability,speed:ability}};
    for(const pitch of p.abilities.pitches) {
      const probabilities=outcomeProbabilities(b,p,pitch);
      expect(Object.values(probabilities).every(v=>Number.isFinite(v)&&v>=0)).toBe(true);
      expect(Object.values(probabilities).reduce((a,b)=>a+b,0)).toBeCloseTo(1,12);
    }
  }
});
it("同じ打者・球種抽選と同一乱数の5万打席で疲労効果を分離", () => {
  const sample=(fatigue:number)=>{
    const rng=new SeededRandom(8234),p=applyPitcherFatigue(base,fatigue);
    let walks=0,hits=0,strikeouts=0;
    for(let i=0;i<50000;i++) {const outcome=drawPlateAppearance(batter,p,rng);walks+=Number(outcome==="walk");hits+=Number(["single","double","triple","homeRun"].includes(outcome));strikeouts+=Number(outcome==="strikeout");}
    return {walks,hits,strikeouts};
  };
  const fresh=sample(0),tired=sample(100);
  expect(tired.walks).toBeGreaterThan(fresh.walks);expect(tired.hits).toBeGreaterThan(fresh.hits);expect(tired.strikeouts).toBeLessThan(fresh.strikeouts);
});
it("打席直前の確定球数だけを使い、打席終了後に球数・疲労を更新", () => {
  const r=simulateMatch(input,{resolvePlateAppearance:c=>{
    expect(c.pitcher).toBe(c.pitcherFatigue.effectivePitcher);
    expect(c.pitcherFatigue.pitcherId).toBe(c.pitcher.id);
    return "strikeout";
  }});
  let pitches=0;
  const events=r.events.filter(e=>e.pitcherId===base.id);
  for(const e of events) {
    expect(e.pitcherFatigue.before).toEqual(pitcherFatigueState(base,pitches));
    pitches+=e.estimatedPitches;
    expect(e.pitcherFatigue.after).toEqual(pitcherFatigueState(base,pitches));
  }
  expect(events[0].pitcherFatigue.before.fatigue).toBe(0);
  expect(events.at(-1)!.pitcherFatigue.before.fatigue).toBeGreaterThan(0);
  expect(r.pitcherFatigueByPlayerId[base.id].pitches).toBe(r.pitchingByPlayerId[base.id].pitches);
  assertMatchAccounting(r);
});
it("盗塁死第3アウトの追加1球を次イニングへ引き継ぎ、打席抽選は行わない", () => {
  const resolve=vi.fn(fixedHalves({"1-top":["walk","strikeout","strikeout","homeRun"]}));
  const r=simulateMatch(input,{resolvePlateAppearance:resolve,resolveStealing:c=>c.plateAppearanceIndex===3 && c.before.half==="top" && c.before.inning===1 ? {action:"out",runnerId:c.candidates[0].id} : {action:"hold"}});
  const steal=r.stealingEvents.find(e=>e.endedHalfInning)!;
  expect(resolve.mock.calls.filter(([c])=>c.before.inning===1&&c.before.half==="top")).toHaveLength(3);
  expect(steal.estimatedPitches).toBe(1);
  expect(steal.pitcherFatigue.after.pitches).toBe(steal.pitcherFatigue.before.pitches+1);
  const next=r.events.find(e=>e.inning===2&&e.half==="top")!;
  expect(next.pitcherFatigue.before).toBe(steal.pitcherFatigue.after);
  expect(next.batterId).toBe(steal.batterId);
  assertMatchAccounting(r);
});
it("盗塁成功・非第三アウトの盗塁死・不実施は球数も疲労も増やさない", () => {
  for(const action of ["safe","out","hold"] as const) {
    const r=simulateMatch(input,{resolvePlateAppearance:fixedHalves({"1-top":["walk"]}),resolveStealing:c=>c.plateAppearanceIndex===1 && c.before.half==="top" && c.before.inning===1 && action!=="hold" ? {action,runnerId:c.candidates[0].id} : {action:"hold"}});
    const e=r.stealingEvents[1];
    expect(e.estimatedPitches).toBe(0);
    expect(e.pitcherFatigue.after).toBe(e.pitcherFatigue.before);
    expect(r.events[1].pitcherFatigue.before).toBe(e.pitcherFatigue.after);
    assertMatchAccounting(r);
  }
});
it("投手ID別に球数・疲労が独立し、休む半イニングでもリセットしない", () => {
  const r=simulateMatch(input,{resolvePlateAppearance:fixedHalves({"1-top":[...Array<"walk">(12).fill("walk") ]})});
  const homeId=input.home.startingPitcherId,awayId=input.away.startingPitcherId;
  const firstBottom=r.events.find(e=>e.half==="bottom")!;
  expect(firstBottom.pitcherFatigue.before.pitches).toBe(0);
  expect(r.events.find(e=>e.inning===2&&e.half==="top")!.pitcherFatigue.before.pitches).toBeGreaterThan(50);
  expect(r.pitcherFatigueByPlayerId[homeId].pitches).toBeGreaterThan(r.pitcherFatigueByPlayerId[awayId].pitches);
  expect(Object.keys(r.pitcherFatigueByPlayerId).sort()).toEqual([homeId,awayId].sort());
  assertMatchAccounting(r);
});
it("元の能力・fitness・セーブ・正式PRNGを維持し、同シード完全再現", () => {
  const before=JSON.stringify(matchFixtureWorld),source=JSON.stringify(input);
  const spy=vi.spyOn(Math,"random").mockImplementation(()=>{throw Error("禁止");});
  try {
    const a=simulateMatch(input);expect(simulateMatch(input)).toEqual(a);expect(a.engineVersion).toBe(7);
    expect(JSON.stringify(input)).toBe(source);expect(JSON.stringify(matchFixtureWorld)).toBe(before);
    expect(JSON.stringify(a)).not.toMatch(/growthType|abilityCaps|developmentByPlayerId|fitness/);
    assertMatchAccounting(a);
  } finally {spy.mockRestore();}
});
it("疲労の有効能力も凍結し、注入から変更できない", () => {
  expect(()=>simulateMatch(input,{resolvePlateAppearance:c=>{Object.assign(c.pitcher.abilities,{control:0});return "strikeout";}})).toThrow();
  expect(()=>simulateMatch(input,{resolvePlateAppearance:c=>{Object.assign(c.pitcherFatigue,{fatigue:100});return "strikeout";}})).toThrow();
});
it("不正な球数・スタミナ・疲労度・非有限能力を明示拒否", () => {
  for(const pitches of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) expect(()=>pitcherFatigue(50,pitches)).toThrow(/球数/);
  for(const stamina of [-1,101,NaN,Infinity,0.5]) expect(()=>pitcherFatigue(stamina,100)).toThrow(/スタミナ/);
  for(const fatigue of [-1,101,NaN,Infinity,"50",null]) expect(()=>applyPitcherFatigue(base,fatigue as number)).toThrow(/疲労度/);
  expect(()=>applyPitcherFatigue({...base,abilities:{...base.abilities,control:NaN}},100)).toThrow(/投球能力/);
});
