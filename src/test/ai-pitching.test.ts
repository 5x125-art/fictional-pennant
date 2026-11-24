import { expect, it, vi } from "vitest";
import { assessAIPitchingChange, chooseAIPitchingChange, pitcherFatigueState, applyPitcherFatigue, simulateMatch,
  type AvailablePitcher, type PitchingChangeContext } from "../game/match";
import { aiPitchingFixture } from "./helpers/aiPitchingFixture";
import { fixedHalves, matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
const p:AvailablePitcher={id:"current",teamId:"home",throws:"R",role:"starter",abilities:{velocityKmh:145,control:50,stamina:50,starterSuitability:50,reliefSuitability:50,pitches:[{type:"fastball",power:50,control:50,movement:3}]}};
const candidates=(["long","middle","setup","closer"] as const).map(role=>({...p,id:role,role}));
function context(pitches=100,inning=7,lead=1,starter=true):PitchingChangeContext {
  const before={inning,half:"top" as const,outs:0,bases:[null,null,null] as const,score:{home:Math.max(lead,0),away:Math.max(-lead,0)},nextBatterIndex:{away:0,home:0}};
  const current={...p,role:starter?"starter" as const:"middle" as const};
  return {eventIndex:30,timelineIndex:60,before,battingTeamId:"away",fieldingTeamId:"home",batter:{id:"b",teamId:"away",bats:"R",abilities:{contactVsRight:50,contactVsLeft:50,power:50,trajectory:2,speed:50,stealing:50,catching:50,throwing:50,arm:50}},
    currentPitcherId:current.id,currentPitcher:current,currentFatigue:pitcherFatigueState(current,pitches),currentStats:{games:1,starts:Number(starter),outs:starter?18:3,hitsAllowed:2,homeRunsAllowed:0,walks:0,hitBatters:0,strikeouts:4,runsAllowed:0,earnedRuns:0,pitches,wins:0,losses:0,saves:0,holds:0},availablePitchers:candidates,responsibilities:[],currentAppearance:{pitcherId:current.id,teamId:"home",role:current.role,starter,entryTimelineIndex:0,entry:{...before,inning:1},exitTimelineIndex:null,exit:null}};
}
const withFatigue=(c:PitchingChangeContext,fatigue:number):PitchingChangeContext=>({...c,currentFatigue:{...c.currentFatigue,fatigue,stage:Math.ceil(fatigue/25),effectivePitcher:applyPitcherFatigue(c.currentPitcher,fatigue)}});

it("低疲労・低球数の先発は6回でも続投し、高疲労なら交代",()=>{
  expect(chooseAIPitchingChange(context(45,6)).action).toBe("continue");
  expect(chooseAIPitchingChange(context(130,7)).action).toBe("change");
  expect(assessAIPitchingChange(context(130,7)).reason).toBe("autoFatigue");
});
it("同じ球数で高スタミナほど続投、同じ固定疲労でも球数を個別反映",()=>{
  const low=context(95,6),current={...p,abilities:{...p.abilities,stamina:100}};
  const high={...low,currentPitcher:current,currentFatigue:pitcherFatigueState(current,95)};
  expect(assessAIPitchingChange(low).pressure).toBeGreaterThan(assessAIPitchingChange(high).pressure);
  expect(chooseAIPitchingChange(low).action).toBe("change");expect(chooseAIPitchingChange(high).action).toBe("continue");
  expect(assessAIPitchingChange(withFatigue(context(120,6),0)).pressure).toBeGreaterThan(assessAIPitchingChange(withFatigue(context(60,6),0)).pressure);
});
it("同じ球数で疲労・実効能力低下が圧力を増やす",()=>{
  const c=context(75,7);expect(assessAIPitchingChange(withFatigue(c,100)).pressure).toBeGreaterThan(assessAIPitchingChange(withFatigue(c,0)).pressure);
});
it("接戦と大量リードでは続投判断が変わり、早期不調にはロングを選ぶ",()=>{
  const close=context(90,7,1),bulk=context(90,7,7);
  expect(chooseAIPitchingChange(close).action).toBe("change");expect(chooseAIPitchingChange(bulk).action).toBe("continue");
  const bad=context(32,2,0);const r=assessAIPitchingChange({...bad,currentStats:{...bad.currentStats,runsAllowed:5,hitsAllowed:6,walks:2}});
  expect(r.reason).toBe("autoEarlyExit");expect(r.decision).toEqual({action:"change",pitcherId:"long"});
});
it.each([[7,1,"setup"],[8,0,"setup"],[9,1,"closer"],[10,0,"closer"],[8,-6,"long"],[4,6,"long"]] as const)("%i回・点差%iでは%sを優先",(inning,lead,role)=>{
  const r=assessAIPitchingChange(context(150,inning,lead));expect(r.decision).toEqual({action:"change",pitcherId:role});
});
it("中盤同点・ビハインドでは中継ぎを優先し、抑えを温存",()=>{
  for(const lead of [0,-1,-3])expect(chooseAIPitchingChange(context(150,6,lead))).toEqual({action:"change",pitcherId:"middle"});
});
it("役割が合わなくても候補1人なら起用し、0人なら疲労100でも続投",()=>{
  const c=context(200,3,-8);
  expect(chooseAIPitchingChange({...c,availablePitchers:[]})).toEqual({action:"continue"});
  for(const role of ["closer","starter"] as const)expect(chooseAIPitchingChange({...c,availablePitchers:[{...p,id:"fallback",role}]})).toEqual({action:"change",pitcherId:"fallback"});
});
it("候補数が少ない・9回同点では続投の余裕を増やす",()=>{
  const c=context(90,9,0),many=assessAIPitchingChange(c),few=assessAIPitchingChange({...c,availablePitchers:[candidates[1]]});
  expect(few.threshold).toBeGreaterThan(many.threshold);
  expect(chooseAIPitchingChange({...c,availablePitchers:[candidates[1]]}).action).toBe("continue");
  expect(chooseAIPitchingChange({...context(180,12,0),availablePitchers:[candidates[1]]}).action).toBe("change");
});
it("救援の短い登板を保護し、イニングをまたげるが負荷が増せば交代",()=>{
  const fresh=context(8,8,1,false);const r=assessAIPitchingChange({...fresh,currentStats:{...fresh.currentStats,outs:1}});
  expect(r.reason).toBe("protectShortStint");
  expect(chooseAIPitchingChange(context(18,8,0,false)).action).toBe("continue");
  expect(chooseAIPitchingChange(context(50,8,0,false)).action).toBe("change");
  const long=context(35,6,0,false);expect(assessAIPitchingChange({...long,currentPitcher:{...long.currentPitcher,role:"long"}}).pressure).toBeLessThan(assessAIPitchingChange(long).pressure);
});
it("各候補の能力・左右・救援適性を個別比較し、同値はIDで決定",()=>{
  const c=context(160,8,1),a={...p,id:"a",role:"setup" as const},b={...a,id:"b"};
  const best=(pitcher:AvailablePitcher)=>assessAIPitchingChange({...c,availablePitchers:[a,pitcher]}).candidates[0].pitcherId;
  for(const key of ["control","velocityKmh","reliefSuitability"] as const){const value=key==="velocityKmh"?160:95;expect(best({...b,abilities:{...b.abilities,[key]:value}})).toBe("b");}
  for(const key of ["power","control","movement"] as const)expect(best({...b,abilities:{...b.abilities,pitches:[{...b.abilities.pitches[0],[key]:key==="movement"?7:95}]}})).toBe("b");
  expect(best({...b,throws:"L"})).toBe("a");
  expect(best({...b})).toBe("a");
  expect(assessAIPitchingChange({...c,availablePitchers:[b,a]}).candidates.map(p=>p.pitcherId)).toEqual(["a","b"]);
});
it("積極度だけを変えると疲労した先発の交代時期が変わる",()=>{
  const c=context(90,7,1);expect(chooseAIPitchingChange(c,{aggression:0}).action).toBe("continue");expect(chooseAIPitchingChange(c,{aggression:1}).action).toBe("change");
});
it("入力を変更せず、判断・比較結果は凍結する",()=>{
  const c=context(120),before=JSON.stringify(c),r=assessAIPitchingChange(c);expect(JSON.stringify(c)).toBe(before);expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.candidates)).toBe(true);expect(Object.isFrozen(r.decision)).toBe(true);
});
it("不正な積極度・AI候補・非有限能力を拒否",()=>{
  for(const aggression of [-1,2,NaN,Infinity,"1"])expect(()=>chooseAIPitchingChange(context(),{aggression:aggression as number})).toThrow();
  expect(()=>chooseAIPitchingChange({...context(),availablePitchers:[p]})).toThrow(/候補/);
  expect(()=>chooseAIPitchingChange({...context(),availablePitchers:[{...candidates[0],abilities:{...p.abilities,control:NaN}}]})).toThrow(/能力/);
  const input=aiPitchingFixture();expect(()=>simulateMatch(input,{autoPitching:"yes"} as never)).toThrow(/オプション/);expect(()=>simulateMatch(input,{pitchingStrategy:{aggression:NaN}})).toThrow(/積極度/);
});
it("通常試合はAI有効・明示指示優先・固定打席は既定でAI省略",()=>{
  const input=aiPitchingFixture(),normal=simulateMatch(input);expect(normal.pitchingChanges.length).toBeGreaterThan(0);
  expect(normal.pitchingChanges.every(e=>e.decisionSource==="ai"&&e.ai?.decision.action==="change"&&e.reason.startsWith("auto"))).toBe(true);
  expect(simulateMatch(input,{autoPitching:false}).pitchingChanges).toHaveLength(0);
  expect(simulateMatch(input,{resolvePitchingChange:()=>({action:"continue"})}).pitchingChanges).toHaveLength(0);
  expect(simulateMatch(input,{resolvePlateAppearance:()=>"strikeout"}).pitchingChanges).toHaveLength(0);
  expect(simulateMatch(input,{autoPitching:true,resolvePlateAppearance:()=>"strikeout"}).pitchingChanges.length).toBeGreaterThan(0);
  assertMatchAccounting(normal);
});
it("明示交代はAI無効化より優先し、AI理由と区別する",()=>{
  const r=simulateMatch(aiPitchingFixture(),{autoPitching:false,resolvePitchingChange:c=>c.eventIndex===0?{action:"change",pitcherId:c.availablePitchers[0].id}:{action:"continue"},resolvePlateAppearance:()=>"strikeout"});
  expect(r.pitchingChanges).toHaveLength(1);expect(r.pitchingChanges[0]).toMatchObject({decisionSource:"explicit",reason:"explicitInstruction"});expect(r.pitchingChanges[0].ai).toBeUndefined();assertMatchAccounting(r);
});
it("AI交代→盗塁死第3アウト、責任走者と投球成績を維持",()=>{
  const input=aiPitchingFixture();
  const script=fixedHalves({"1-top":[...Array<"walk">(12).fill("walk"),"homeRun","walk","strikeout","strikeout"]});
  const r=simulateMatch(input,{autoPitching:true,resolvePlateAppearance:script,resolveStealing:c=>c.before.outs===2&&c.candidates.length?{action:"out",runnerId:c.candidates[0].id}:{action:"hold"}});
  expect(r.pitchingChanges.length).toBeGreaterThan(0);expect(r.stealingEvents.some(e=>e.endedHalfInning)).toBe(true);assertMatchAccounting(r);
});
it.each([9,10,12])("%i回裏サヨナラ後にAI判断を追加しない",inning=>{
  const r=simulateMatch(aiPitchingFixture(),{autoPitching:true,resolvePlateAppearance:fixedHalves({[`${inning}-bottom`]:["walk","homeRun"]})});
  expect(r.endReason).toBe("walkOff");expect(r.timeline.at(-1)?.type).toBe("plateAppearance");assertMatchAccounting(r);
});
it("候補不足でも12回まで完了し、再登板・無限交代・不正成績がない",()=>{
  const input=aiPitchingFixture();const custom={...input,away:{...input.away,availablePlayerIds:input.away.availablePlayerIds.slice(0,11)},home:{...input.home,availablePlayerIds:input.home.availablePlayerIds.slice(0,11)}};
  const r=simulateMatch(custom,{autoPitching:true,resolvePlateAppearance:()=>"strikeout"});expect(r.endReason).toBe("twelveInningDraw");expect(r.pitcherAppearances).toHaveLength(4);expect(new Set(r.pitcherAppearances.map(a=>a.pitcherId)).size).toBe(4);assertMatchAccounting(r);
});
it("同一シード完全再現、選手・fitness・保存世界・正式乱数の非変更",()=>{
  const input=aiPitchingFixture(),before=JSON.stringify(input),world=JSON.stringify(matchFixtureWorld);
  const spy=vi.spyOn(Math,"random").mockImplementation(()=>{throw Error("禁止");});
  try{const a=simulateMatch(input);expect(simulateMatch(input)).toEqual(a);expect(a.engineVersion).toBe(9);expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(matchFixtureWorld)).toBe(world);expect(JSON.stringify(a)).not.toMatch(/growthType|abilityCaps|developmentByPlayerId|fitness/);assertMatchAccounting(a);}finally{spy.mockRestore();}
});
it("能力の高い抑えを中盤には温存し、終盤接戦で選べる",()=>{
  const middle={...p,id:"middle",role:"middle" as const};
  const closer={...p,id:"closer",role:"closer" as const,abilities:{...p.abilities,control:85,velocityKmh:155,pitches:[{type:"fastball" as const,power:75,control:75,movement:4}]}};
  const availablePitchers=[middle,closer];
  expect(chooseAIPitchingChange({...context(180,6,0),availablePitchers})).toEqual({action:"change",pitcherId:"middle"});
  expect(chooseAIPitchingChange({...context(180,9,1),availablePitchers})).toEqual({action:"change",pitcherId:"closer"});
});
it("終盤の役割更新の根拠をautoHighLeverageとして追跡できる",()=>{
  const c=withFatigue(context(40,9,1,false),0);
  const r=assessAIPitchingChange({...c,currentStats:{...c.currentStats,outs:4}});
  expect(r.decision.action).toBe("change");expect(r.reason).toBe("autoHighLeverage");expect(r.lead).toBe(1);expect(r.candidates[0].role).toBe("closer");
});
