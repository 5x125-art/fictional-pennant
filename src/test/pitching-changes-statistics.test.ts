import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { teams } from "../data/teams";
import { simulateMatch, type MatchResult, type MatchOptions } from "../game/match";
import { pitchingFixture } from "./helpers/pitchingFixture";
import { matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";

it("同じベンチ・256シードで続投と明示継投シナリオを比較",()=>{
  const sample=(useChanges:boolean)=>{
    let runs=0,hits=0,atBats=0,homeRuns=0,walks=0,strikeouts=0,pa=0,starterPitches=0,reliefPitches=0,reliefAppearances=0,appearances=0,changes=0,inherited=0,inheritedScored=0,pitcherRuns=0,earned=0,extras=0,draws=0;
    const before=JSON.stringify(matchFixtureWorld);
    for(let seed=0;seed<256;seed++){
      const input=pitchingFixture(seed,teams[seed%12].id,teams[((seed%12)+1+(Math.floor(seed/12)%11))%12].id);
      const firstRelief=(teamId:string)=>input[teamId===input.away.teamId?"away":"home"].availablePlayerIds.find(id=>{
        const p=input.players.find(p=>p.id===id)!;return p.kind==="pitcher"&&p.role!=="starter";
      });
      // テスト専用の決定的な指示。製品に自動継投判断を導入しない。
      const resolvePitchingChange:NonNullable<MatchOptions["resolvePitchingChange"]>=c=>{
        if(!useChanges)return {action:"continue"};
        const scheduled=c.before.inning===6&&c.currentStats.starts===1 || c.before.inning===8&&c.currentPitcherId===firstRelief(c.fieldingTeamId)&&(c.before.bases.some(Boolean)||c.before.outs===2);
        return scheduled ? {action:"change",pitcherId:c.availablePitchers[0].id} : {action:"continue"};
      };
      const r=simulateMatch(input,{resolvePitchingChange});assertMatchAccounting(r);
      if(!useChanges){
        // 続投コールバック自体も乱数・結果を変えない。
        const absent=simulateMatch(input);
        expect(r).toEqual(absent);
      }
      runs+=r.score.away+r.score.home;extras+=Number(r.innings.length>9);draws+=Number(r.winnerTeamId===null);
      for(const b of Object.values(r.battingByPlayerId)){hits+=b.hits;atBats+=b.atBats;homeRuns+=b.homeRuns;walks+=b.walks;strikeouts+=b.strikeouts;pa+=b.plateAppearances;}
      for(const a of r.pitcherAppearances){const p=r.pitchingByPlayerId[a.pitcherId];appearances++;pitcherRuns+=p.runsAllowed;earned+=p.earnedRuns;if(a.starter)starterPitches+=p.pitches;else{reliefPitches+=p.pitches;reliefAppearances++;}}
      changes+=r.pitchingChanges.length;
      const inheritedTokens=new Set<string>();
      for(const c of r.pitchingChanges){inherited+=c.responsibilities.length;for(const runner of c.responsibilities)inheritedTokens.add(runner.token);}
      inheritedScored+=r.events.flatMap(e=>e.scoredRuns).filter(run=>inheritedTokens.has(run.token)).length;
      if(useChanges)expect(r.pitchingDecision.status).toBe("unadjudicated");
    }
    expect(JSON.stringify(matchFixtureWorld)).toBe(before);expect(pitcherRuns).toBe(runs);
    return {games:256,teamGames:512,runsPerTeam:runs/512,battingAverage:hits/atBats,homeRunsPerTeam:homeRuns/512,walks,strikeouts,walkRate:walks/pa,strikeoutRate:strikeouts/pa,
      starterPitchesPerAppearance:starterPitches/512,reliefPitchesPerAppearance:reliefAppearances?reliefPitches/reliefAppearances:0,reliefAppearances,
      pitchersPerGame:appearances/256,pitchingChanges:changes,runnersAtChanges:inherited,inheritedRunnersScored:inheritedScored,pitcherRunsAllowed:pitcherRuns,earnedRuns:earned,extraInningGames:extras,draws};
  };
  const control=sample(false),changes=sample(true);
  expect(control.pitchingChanges).toBe(0);expect(control.pitchersPerGame).toBe(2);
  expect(changes.pitchingChanges).toBe(1024);expect(changes.pitchersPerGame).toBe(6);expect(changes.runnersAtChanges).toBeGreaterThan(0);expect(changes.inheritedRunnersScored).toBeGreaterThan(0);
  if(process.env.PITCHING_COMPARISON_REPORT)writeFileSync(process.env.PITCHING_COMPARISON_REPORT,JSON.stringify({worldSeed:matchFixtureWorld.seed,matchSeeds:"0..255",schedule:"6回開始、8回最初の走者あり／2アウトで各1回",control,changes},null,2)+"\n");
},90000);
