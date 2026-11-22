import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { teams } from "../data/teams";
import { simulateMatch, type MatchOptions } from "../game/match";
import { aiPitchingFixture } from "./helpers/aiPitchingFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";
import { matchFixtureWorld } from "./helpers/matchFixture";

it("同一ベンチ・256シードでAIなし／固定／AI、積極度0・0.5・1を比較",()=>{
  const before=JSON.stringify(matchFixtureWorld);
  const sample=(mode:"none"|"fixed"|"ai",aggression=0.5)=>{
    let runs=0,hits=0,atBats=0,hr=0,walks=0,ks=0,pa=0,starters=0,reliefPitches=0,reliefs=0,appearances=0,changes=0,inherited=0,inheritedScored=0,pitcherRuns=0,earned=0,extras=0,draws=0,earlyClosers=0,highFatigueContinues=0,lateEmpty=0,extraEmpty=0;
    const starterExitInnings:Record<string,number>={},roleAppearances:Record<string,number>={},rolePitches:Record<string,number>={},fatigueStages:Record<string,number>={},leadBands:Record<string,number>={},reasons:Record<string,number>={},hashes:string[]=[];
    const count=(map:Record<string,number>,key:string,value=1)=>{map[key]=(map[key]??0)+value;};
    for(let seed=0;seed<256;seed++){
      const input=aiPitchingFixture(seed,teams[seed%12].id,teams[((seed%12)+1+(Math.floor(seed/12)%11))%12].id);
      const playerIndex=new Map(input.players.map(p=>[p.id,p]));
      const firstRelief=(teamId:string)=>input[teamId===input.away.teamId?"away":"home"].availablePlayerIds.find(id=>{const p=playerIndex.get(id)!;return p.kind==="pitcher"&&p.role!=="starter";});
      const options:MatchOptions=mode==="fixed"?{resolvePitchingChange:c=>{
        const scheduled=c.before.inning===6&&c.currentStats.starts===1||c.before.inning===8&&c.currentPitcherId===firstRelief(c.fieldingTeamId)&&(c.before.bases.some(Boolean)||c.before.outs===2);
        return scheduled?{action:"change",pitcherId:c.availablePitchers[0].id}:{action:"continue"};
      }}:{autoPitching:mode==="ai",pitchingStrategy:{aggression}};
      const r=simulateMatch(input,options);assertMatchAccounting(r);
      hashes.push(createHash("sha256").update(JSON.stringify(r,(key,value)=>["engineVersion","currentPitcher","currentAppearance","decisionSource","ai"].includes(key)?undefined:value)).digest("hex"));
      runs+=r.score.away+r.score.home;extras+=Number(r.innings.length>9);draws+=Number(r.winnerTeamId===null);
      for(const b of Object.values(r.battingByPlayerId)){hits+=b.hits;atBats+=b.atBats;hr+=b.homeRuns;walks+=b.walks;ks+=b.strikeouts;pa+=b.plateAppearances;}
      for(const a of r.pitcherAppearances){const p=r.pitchingByPlayerId[a.pitcherId];appearances++;pitcherRuns+=p.runsAllowed;earned+=p.earnedRuns;if(a.starter){starters+=p.pitches;count(starterExitInnings,a.exit?String(a.exit.inning):"completed");}else{reliefPitches+=p.pitches;reliefs++;count(roleAppearances,a.role);count(rolePitches,a.role,p.pitches);if(a.role==="closer"&&a.entry!.inning<7)earlyClosers++;}}
      changes+=r.pitchingChanges.length;
      const inheritedTokens=new Set<string>();
      for(const c of r.pitchingChanges){inherited+=c.responsibilities.length;for(const runner of c.responsibilities)inheritedTokens.add(runner.token);count(fatigueStages,String(c.currentFatigue.stage));const lead=c.before.score[c.before.half==="top"?"home":"away"]-c.before.score[c.before.half==="top"?"away":"home"];count(leadBands,lead>=5?"lead5+":lead>0?"lead1..4":lead===0?"tie":lead<=-5?"behind5+":"behind1..4");count(reasons,c.reason);}
      inheritedScored+=r.events.flatMap(e=>e.scoredRuns).filter(run=>inheritedTokens.has(run.token)).length;
      // 実際に打席を続行した状態を候補の資格と照合。枯渇は失敗ではなく観測値。
      const paTimelineIndexes=new Map(r.timeline.flatMap((t,i)=>t.type==="plateAppearance"?[[t.event.index,i] as const]:[]));
      for(const e of r.events){
        const appeared=new Set(r.pitcherAppearances.filter(a=>a.teamId===e.fieldingTeamId&&a.entryTimelineIndex!==null&&a.entryTimelineIndex<=paTimelineIndexes.get(e.index)!).map(a=>a.pitcherId));
        const team=e.fieldingTeamId===input.away.teamId?input.away:input.home;
        const available=team.availablePlayerIds.filter(id=>playerIndex.get(id)!.kind==="pitcher"&&!appeared.has(id));
        if(e.inning>=7&&!available.length)lateEmpty++;
        if(e.inning>=10&&!available.length)extraEmpty++;
        if(e.pitcherFatigue.before.fatigue>=90&&available.length)highFatigueContinues++;
      }
    }
    expect(pitcherRuns).toBe(runs);
    return {mode,aggression,games:256,runsPerTeam:runs/512,battingAverage:hits/atBats,homeRunsPerTeam:hr/512,walks,strikeouts:ks,walkRate:walks/pa,strikeoutRate:ks/pa,pitchersPerGame:appearances/256,starterPitchesPerAppearance:starters/512,reliefPitchesPerAppearance:reliefs?reliefPitches/reliefs:0,pitchingChanges:changes,starterExitInnings,roleAppearances,roleMeanPitches:Object.fromEntries(Object.keys(roleAppearances).map(role=>[role,rolePitches[role]/roleAppearances[role]])),fatigueStages,leadBands,reasons,earlyClosers,lateNoCandidatePlateAppearances:lateEmpty,extraNoCandidatePlateAppearances:extraEmpty,highFatigueContinuesWithCandidates:highFatigueContinues,runnersAtChanges:inherited,inheritedRunnersScored:inheritedScored,pitcherRunsAllowed:pitcherRuns,earnedRuns:earned,extraInningGames:extras,draws,behaviorDigest:createHash("sha256").update(hashes.join("\n")).digest("hex")};
  };
  const none=sample("none");
  if(process.env.AI_BASELINE_CAPTURE){writeFileSync(process.env.AI_BASELINE_CAPTURE,JSON.stringify(none,null,2)+"\n");return;}
  const fixed=sample("fixed"),standard=sample("ai"),cautious=sample("ai",0),aggressive=sample("ai",1);
  if(process.env.AI_COMPATIBILITY_BASELINE){const baseline=JSON.parse(readFileSync(process.env.AI_COMPATIBILITY_BASELINE,"utf8"));expect(none).toEqual(baseline);}
  expect(none.pitchingChanges).toBe(0);expect(fixed.pitchingChanges).toBe(1024);expect(standard.pitchingChanges).toBeGreaterThan(0);
  expect(aggressive.pitchingChanges).toBeGreaterThan(cautious.pitchingChanges);expect(aggressive.starterPitchesPerAppearance).toBeLessThan(cautious.starterPitchesPerAppearance);
  expect(standard.highFatigueContinuesWithCandidates).toBe(0);expect(Object.keys(standard.starterExitInnings).length).toBeGreaterThan(2);
  expect(JSON.stringify(matchFixtureWorld)).toBe(before);
  if(process.env.AI_PITCHING_REPORT)writeFileSync(process.env.AI_PITCHING_REPORT,JSON.stringify({worldSeed:matchFixtureWorld.seed,matchSeeds:"0..255",none,fixed,standard,cautious,aggressive},null,2)+"\n");
},180000);
