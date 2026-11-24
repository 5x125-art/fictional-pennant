import { expect, it, vi } from "vitest";
import type { Pitcher } from "../game/players/types";
import { simulateMatch, type MatchOptions, type PitchingChangeDecision, type PitchingChangeContext } from "../game/match";
import { pitchingFixture } from "./helpers/pitchingFixture";
import { fixedHalves, matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const input=pitchingFixture();
const stay={action:"continue"} as const;
type Change=NonNullable<MatchOptions["resolvePitchingChange"]>;
const changeAt=(...indices:number[]):Change=>c=>c.before.inning===1 && c.before.half==="top" && indices.includes(c.eventIndex) ? {action:"change",pitcherId:c.availablePitchers[0].id} : stay;
const game=(scripts:Parameters<typeof fixedHalves>[0],change:Change,other:MatchOptions={})=>simulateMatch(input,{...other,resolvePlateAppearance:fixedHalves(scripts),resolvePitchingChange:change});

it("先発→救援・複数回の交代を打席前に実施し、成績・役割・初期疲労を分離",()=>{
  const r=game({"1-top":["walk","walk","homeRun"]},changeAt(1,2));
  expect(r.pitchingChanges).toHaveLength(2);
  const [a,b,c]=r.events.slice(0,3).map(e=>e.pitcherId);
  expect(new Set([a,b,c]).size).toBe(3);
  expect(r.pitchingByPlayerId[a]).toMatchObject({games:1,starts:1,walks:1,hitsAllowed:0,runsAllowed:1,earnedRuns:1});
  expect(r.pitchingByPlayerId[b]).toMatchObject({games:1,starts:0,walks:1,hitsAllowed:0,runsAllowed:1,earnedRuns:1});
  expect(r.pitchingByPlayerId[c]).toMatchObject({games:1,starts:0,homeRunsAllowed:1,hitsAllowed:1,runsAllowed:1,earnedRuns:1});
  expect(r.events[2].scoredRuns.map(run=>run.responsiblePitcherId)).toEqual([a,b,c]);
  for(const e of r.pitchingChanges){expect(e.after).toBe(e.before);expect(e.incomingFatigue).toMatchObject({pitches:0,fatigue:0});expect(e.currentStats.starts).toBe(e.outgoingPitcherId===a?1:0);}
  expect(r.pitcherAppearances.find(p=>p.pitcherId===b)?.role).toBe((input.players.find(p=>p.id===b) as Pitcher).role);
  assertMatchAccounting(r);
});
it.each([0,1,2])("%iアウト・走者ありの交代で塁・アウト・得点・打順を変更しない",outs=>{
  const script=["walk",...Array<"strikeout">(outs).fill("strikeout"),"double"] as const;
  const r=game({"1-top":script},changeAt(1+outs));
  const e=r.pitchingChanges[0];
  expect(e.before.outs).toBe(outs);expect(e.before.bases[0]).toBe(r.events[0].batterId);expect(e.after).toEqual(e.before);
  expect(e.responsibilities).toEqual(r.events[0].responsibilities);
  expect(r.events[outs+1].pitcherId).toBe(e.incomingPitcherId);
  assertMatchAccounting(r);
});
it("二塁打の追加生還でも失点責任は前投手、被安打は救援",()=>{
  const r=game({"1-top":["walk","double"]},changeAt(1),{resolveBaserunning:()=>"safe"});
  const [a,b]=r.events;
  expect(b.scoredRuns).toEqual(a.responsibilities);
  expect(r.pitchingByPlayerId[a.pitcherId]).toMatchObject({runsAllowed:1,earnedRuns:1,hitsAllowed:0});
  expect(r.pitchingByPlayerId[b.pitcherId]).toMatchObject({runsAllowed:0,earnedRuns:0,hitsAllowed:1});
  expect(r.pitchingChanges[0].currentStats.runsAllowed).toBe(0); // 交代ログは後日の責任失点で書き換えない。
  assertMatchAccounting(r);
});
it("押し出しは既存走者の責任投手へ、本塁打打者は新投手へ",()=>{
  const r=game({"1-top":["walk","walk","walk","walk","homeRun"]},changeAt(3));
  const a=r.events[0].pitcherId,b=r.events[3].pitcherId;
  expect(r.events[3].scoredRuns[0].responsiblePitcherId).toBe(a);
  expect(r.pitchingByPlayerId[a]).toMatchObject({runsAllowed:3,earnedRuns:3});
  expect(r.pitchingByPlayerId[b]).toMatchObject({runsAllowed:2,earnedRuns:2,homeRunsAllowed:1,walks:1});
  assertMatchAccounting(r);
});
it("失策走者の失点は前投手・非自責、救援HR打者は自責",()=>{
  const r=game({"1-top":["groundOut","homeRun"]},changeAt(1),{resolveDefense:c=>c.eventIndex===0?"catchingError":"none"});
  expect(r.pitchingByPlayerId[r.events[0].pitcherId]).toMatchObject({runsAllowed:1,earnedRuns:0});
  expect(r.pitchingByPlayerId[r.events[1].pitcherId]).toMatchObject({runsAllowed:1,earnedRuns:1});
  assertMatchAccounting(r);
});
it("仮想第3アウト後に交代しても、後続得点をいずれの投手の自責にもしない",()=>{
  const r=game({"1-top":["strikeout","strikeout","groundOut","homeRun"]},changeAt(3),{resolveDefense:c=>c.eventIndex===2?"catchingError":"none"});
  expect(r.pitchingByPlayerId[r.events[0].pitcherId]).toMatchObject({runsAllowed:1,earnedRuns:0});
  expect(r.pitchingByPlayerId[r.events[3].pitcherId]).toMatchObject({runsAllowed:1,earnedRuns:0});
  assertMatchAccounting(r);
});
it("盗塁・追加進塁で責任トークンを維持し、盗塁死・走塁死で終了",()=>{
  for(const action of ["safe","out"] as const){
    const r=game({"1-top":["walk","double","homeRun"]},changeAt(1),{resolveStealing:c=>c.plateAppearanceIndex===1 && c.before.inning===1 && c.before.half==="top" ? {action,runnerId:c.candidates[0].id}:{action:"hold"}});
    const token=r.events[0].responsibilities[0];
    const steal=r.stealingEvents.find(e=>e.attempted)!;
    expect(steal.responsibilities.some(r=>r.token===token.token)).toBe(action==="safe");
    expect(r.events.flatMap(e=>e.scoredRuns).filter(r=>r.token===token.token)).toHaveLength(action==="safe"?1:0);
    assertMatchAccounting(r);
  }
  const r=game({"1-top":["walk","single","homeRun"]},changeAt(1),{resolveBaserunning:()=>"out"});
  expect(r.pitchingByPlayerId[r.events[0].pitcherId].runsAllowed).toBe(0);
  expect(r.events[1].responsibilities.some(t=>t.playerId===r.events[0].batterId)).toBe(false);
  assertMatchAccounting(r);
});
it("打者一巡後の同選手の再出塁を別トークン・別責任投手として扱う",()=>{
  const r=game({"1-top":[...Array<"homeRun">(10).fill("homeRun")]},changeAt(9));
  const first=r.events[0].scoredRuns[0],second=r.events[9].scoredRuns[0];
  expect(first.playerId).toBe(second.playerId);expect(first.token).not.toBe(second.token);expect(first.responsiblePitcherId).not.toBe(second.responsiblePitcherId);
  expect(r.pitchingByPlayerId[first.responsiblePitcherId].runsAllowed).toBe(9);
  expect(r.pitchingByPlayerId[second.responsiblePitcherId].runsAllowed).toBe(1);
  assertMatchAccounting(r);
});
it("疲れた先発の球数を救援へ引き継がず、新投手の有効能力を使う",()=>{
  const custom={...input,players:input.players.map(p=>p.kind==="pitcher" && p.id===input.home.startingPitcherId?{...p,abilities:{...p.abilities,stamina:0}}:p)};
  let observed=false;
  const script=fixedHalves({"1-top":[...Array<"walk">(12).fill("walk"),"strikeout"]});
  const r=simulateMatch(custom,{resolvePitchingChange:changeAt(12),resolvePlateAppearance:c=>{
    if(c.eventIndex===12){observed=true;expect(c.pitcherFatigue).toMatchObject({pitches:0,fatigue:0});const p=custom.players.find(p=>p.id===c.pitcher.id)!;if(p.kind==="pitcher")expect(c.pitcher.abilities).toEqual(p.abilities);}
    return script(c);
  }});
  expect(observed).toBe(true);expect(r.pitchingChanges[0].currentFatigue.fatigue).toBeGreaterThan(0);
  expect(r.pitcherFatigueByPlayerId[input.home.startingPitcherId]).toBe(r.pitchingChanges[0].currentFatigue);
  assertMatchAccounting(r);
});
it("交代→盗塁死第3アウトの順で救援へ1球・1アウト、次回も未完了打者",()=>{
  const changed=vi.fn(changeAt(3));
  const r=game({"1-top":["walk","strikeout","strikeout","homeRun"]},changed,{resolveStealing:c=>c.plateAppearanceIndex===3 && c.before.half==="top" && c.before.inning===1?{action:"out",runnerId:c.candidates[0].id}:{action:"hold"}});
  const e=r.pitchingChanges[0],steal=r.stealingEvents.find(e=>e.endedHalfInning)!;
  expect(steal.pitcherId).toBe(e.incomingPitcherId);expect(steal.pitcherFatigue.after.pitches).toBe(1);
  expect(r.pitchingByPlayerId[e.outgoingPitcherId].outs).toBe(2);
  expect(changed.mock.calls.filter(([c])=>c.before.inning===1 && c.before.half==="top")).toHaveLength(4);
  expect(r.events.find(e=>e.inning===2&&e.half==="top")!.batterId).toBe(steal.batterId);
  const idx=r.timeline.findIndex(t=>t.type==="pitchingChange");expect(r.timeline[idx+1]).toMatchObject({type:"stealing",event:{endedHalfInning:true}});
  assertMatchAccounting(r);
});
it("降板した投手・現在投手への交代を拒否",()=>{
  for(const reenter of [true,false])expect(()=>game({"1-top":["walk"]},c=>{
    if(c.eventIndex===1&&c.before.inning===1&&c.before.half==="top")return{action:"change",pitcherId:c.availablePitchers[0].id};
    if(c.eventIndex===2&&c.before.inning===1&&c.before.half==="top")return{action:"change",pitcherId:reenter?input.home.startingPitcherId:c.currentPitcherId};
    return stay;
  })).toThrow(/未登板投手/);
});
it("野手・他球団・ベンチ外・未登録・育成投手への交代を拒否",()=>{
  const foreign=input.away.startingPitcherId,fielder=input.home.battingOrder[0].playerId;
  const unregistered=input.players.find(p=>p.kind==="pitcher"&&p.teamId===input.home.teamId&&!input.roster.byTeam[p.teamId].firstTeamIds.includes(p.id))!.id;
  const benchOutside=input.players.find(p=>p.kind==="pitcher"&&p.teamId===input.home.teamId&&input.roster.byTeam[p.teamId].firstTeamIds.includes(p.id)&&!input.home.availablePlayerIds.includes(p.id))!.id;
  const development=input.players.find(p=>p.kind==="pitcher"&&p.teamId===input.home.teamId&&p.registration==="development")!.id;
  for(const id of [foreign,fielder,unregistered,benchOutside,development,"missing"])expect(()=>game({},()=>({action:"change",pitcherId:id}))).toThrow(/未登板投手/);
});
it("不正な指示・非関数を明示拒否し、文脈と成績・能力を凍結",()=>{
  for(const d of [null,undefined,[],"change",{action:"switch"},{action:"change"},{action:"continue",pitcherId:"a"},{action:"change",pitcherId:3},{action:"change",pitcherId:"a",outs:3}])expect(()=>game({},()=>d as PitchingChangeDecision)).toThrow(/投手交代/);
  expect(()=>simulateMatch(input,{resolvePitchingChange:true} as never)).toThrow(/オプション/);
  for(const mutate of [(c:PitchingChangeContext)=>Object.assign(c.currentStats,{outs:99}),(c:PitchingChangeContext)=>Object.assign(c.availablePitchers[0].abilities,{control:0}),(c:PitchingChangeContext)=>Object.assign(c.before.nextBatterIndex,{away:8})])expect(()=>game({},c=>{mutate(c);return stay;})).toThrow();
});
it("未登板投手には成績を作らず、続投判断はイベントを増やさない",()=>{
  const r=game({},()=>stay);expect(r.pitchingChanges).toHaveLength(0);expect(Object.keys(r.pitchingByPlayerId)).toHaveLength(2);expect(r.pitcherAppearances).toHaveLength(2);expect(r.pitchingDecision.status).toBe("draw");assertMatchAccounting(r);
});
it("投球前の即時交代でも先発・救援の登板記録と球数0を保持",()=>{
  const r=game({},changeAt(0));expect(r.pitchingByPlayerId[input.home.startingPitcherId]).toMatchObject({games:1,starts:1,outs:0,pitches:0});assertMatchAccounting(r);
});
it("複数投手時も個人勝敗を裁定し、完投時は既存の勝敗を維持",()=>{
  const multi=game({"1-top":["homeRun"]},changeAt(1));expect(multi.winnerTeamId).toBe(input.away.teamId);expect(multi.pitchingDecision).toMatchObject({status:"adjudicated", winPitcherId:input.away.startingPitcherId, lossPitcherId:input.home.startingPitcherId});
  const complete=game({"1-top":["homeRun"]},()=>stay);expect(complete.pitchingDecision.status).toBe("adjudicated");expect(complete.pitchingByPlayerId[input.away.startingPitcherId].wins).toBe(1);expect(complete.pitchingByPlayerId[input.home.startingPitcherId].losses).toBe(1);assertMatchAccounting(multi);assertMatchAccounting(complete);
});
it.each([9,10,12])("%i回裏の走者あり交代・サヨナラを処理し、その後の交代はしない",inning=>{
  const callback=vi.fn<Change>(c=>c.before.inning===inning&&c.before.half==="bottom"&&c.responsibilities.length?{action:"change",pitcherId:c.availablePitchers[0].id}:stay);
  const r=game({[`${inning}-bottom`]:["walk","homeRun"]},callback);expect(r.endReason).toBe("walkOff");expect(r.pitchingChanges).toHaveLength(1);expect(r.timeline.at(-1)?.type).toBe("plateAppearance");assertMatchAccounting(r);
});
it("延長12回の交代後も引き分けを裁定",()=>{
  const r=game({},c=>c.before.inning===12&&c.before.half==="top"&&c.availablePitchers.length?{action:"change",pitcherId:c.availablePitchers[0].id}:stay);expect(r.endReason).toBe("twelveInningDraw");expect(r.pitchingDecision.status).toBe("draw");assertMatchAccounting(r);
});
it("同シード・決定的継投の完全再現、選手・セーブ・正式乱数の非変更",()=>{
  const before=JSON.stringify(matchFixtureWorld),source=JSON.stringify(input);
  const change:Change=c=>c.currentFatigue.pitches>=60&&c.availablePitchers.length?{action:"change",pitcherId:c.availablePitchers[0].id}:stay;
  const spy=vi.spyOn(Math,"random").mockImplementation(()=>{throw Error("禁止");});
  try{const a=simulateMatch(input,{resolvePitchingChange:change});expect(simulateMatch(input,{resolvePitchingChange:change})).toEqual(a);expect(a.engineVersion).toBe(9);expect(a.pitchingChanges.length).toBeGreaterThan(0);expect(JSON.stringify(a)).not.toMatch(/growthType|abilityCaps|developmentByPlayerId|fitness/);expect(JSON.stringify(input)).toBe(source);expect(JSON.stringify(matchFixtureWorld)).toBe(before);assertMatchAccounting(a);}finally{spy.mockRestore();}
});

it("当日ベンチそのものが未登録・育成・他球団選手を含む場合は開始前に拒否",()=>{
  const invalid=[input.away.startingPitcherId,
    input.players.find(p=>p.kind==="pitcher"&&p.teamId===input.home.teamId&&!input.roster.byTeam[p.teamId].firstTeamIds.includes(p.id))!.id,
    input.players.find(p=>p.kind==="pitcher"&&p.teamId===input.home.teamId&&p.registration==="development")!.id];
  for(const id of invalid)expect(()=>simulateMatch({...input,home:{...input.home,availablePlayerIds:[...input.home.availablePlayerIds,id]}})).toThrow();
});
it("救援適性0・先発役割の投手でも当日ベンチから交代でき、能力・役割を維持",()=>{
  const reliefId=input.home.availablePlayerIds.find(id=>{const p=input.players.find(p=>p.id===id)!;return p.kind==="pitcher"&&p.id!==input.home.startingPitcherId;})!;
  const custom={...input,players:input.players.map(p=>p.kind==="pitcher"&&p.id===reliefId?{...p,role:"starter" as const,abilities:{...p.abilities,reliefSuitability:0}}:p)};
  const r=simulateMatch(custom,{resolvePlateAppearance:fixedHalves({"1-top":["walk"]}),resolvePitchingChange:c=>c.eventIndex===1&&c.before.half==="top"?{action:"change",pitcherId:reliefId}:stay});
  expect(r.pitcherAppearances.find(a=>a.pitcherId===reliefId)).toMatchObject({role:"starter",starter:false});
  expect(r.pitcherFatigueByPlayerId[reliefId].effectivePitcher.abilities.reliefSuitability).toBe(0);assertMatchAccounting(r);
});
