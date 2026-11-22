import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { teams } from "../data/teams";
import { simulateMatch } from "../game/match";
import { matchFixture, matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";

it("投手スタミナだけ0／100へ変更して各256試合と後半傾向を比較", () => {
  const before=JSON.stringify(matchFixtureWorld);
  const sample=(stamina:number)=>{
    let runs=0,hits=0,atBats=0,homeRuns=0,walks=0,strikeouts=0,pa=0,pitches=0,fatigue=0,preFatigue=0,control=0,steals=0,caught=0,advance=0,runOuts=0,errors=0,prevented=0,earned=0,extras=0,draws=0;
    const early={plateAppearances:0,runs:0,walks:0,strikeouts:0},late={...early};
    for(let seed=0;seed<256;seed++) {
      const input=matchFixture(seed,teams[seed%12].id,teams[((seed%12)+1+(Math.floor(seed/12)%11))%12].id);
      const players=input.players.map(p=>p.kind==="pitcher" ? {...p,abilities:{...p.abilities,stamina}} : p);
      const r=simulateMatch({...input,players});assertMatchAccounting(r);
      runs+=r.score.away+r.score.home;extras+=Number(r.innings.length>9);draws+=Number(r.winnerTeamId===null);
      for(const b of Object.values(r.battingByPlayerId)){hits+=b.hits;atBats+=b.atBats;homeRuns+=b.homeRuns;walks+=b.walks;strikeouts+=b.strikeouts;pa+=b.plateAppearances;steals+=b.stolenBases;caught+=b.caughtStealing;}
      for(const p of Object.values(r.pitchingByPlayerId)){pitches+=p.pitches;earned+=p.earnedRuns;}
      for(const f of Object.values(r.pitcherFatigueByPlayerId))fatigue+=f.fatigue;
      for(const f of Object.values(r.fieldingByPlayerId)){errors+=f.errors;prevented+=f.hitsPrevented;}
      for(const e of r.events){
        preFatigue+=e.pitcherFatigue.before.fatigue;control+=e.pitcherFatigue.before.effectivePitcher.abilities.control;
        const period=e.inning>=7 ? late : early;period.plateAppearances++;period.runs+=e.scoredPlayerIds.length;period.walks+=Number(e.outcome==="walk");period.strikeouts+=Number(e.outcome==="strikeout");
        for(const m of e.movements){advance+=Number(m.extraAdvance?.action==="safe");runOuts+=Number(m.extraAdvance?.action==="out");}
      }
    }
    return {stamina,games:256,runsPerTeam:runs/512,battingAverage:hits/atBats,homeRunsPerTeam:homeRuns/512,walkRate:walks/pa,strikeoutRate:strikeouts/pa,pitchesPerTeam:pitches/512,
      averageFinalFatigue:fatigue/512,averagePrePlateAppearanceFatigue:preFatigue/pa,averageEffectiveControl:control/pa,stolenBases:steals,caughtStealing:caught,extraAdvanceSuccesses:advance,baserunningOuts:runOuts,errors,hitsPrevented:prevented,earnedRuns:earned,extraInningGames:extras,draws,
      periods:{early:{...early,runsPerPlateAppearance:early.runs/early.plateAppearances,walkRate:early.walks/early.plateAppearances},late:{...late,runsPerPlateAppearance:late.runs/late.plateAppearances,walkRate:late.walks/late.plateAppearances}}};
  };
  const low=sample(0),high=sample(100);
  expect(high.averageFinalFatigue).toBeLessThan(low.averageFinalFatigue);
  expect(high.averagePrePlateAppearanceFatigue).toBeLessThan(low.averagePrePlateAppearanceFatigue);
  expect(high.averageEffectiveControl).toBeGreaterThan(low.averageEffectiveControl);
  for(const sample of [low,high]){expect(sample.runsPerTeam).toBeGreaterThan(1);expect(sample.runsPerTeam).toBeLessThan(10);expect(sample.walkRate).toBeLessThan(0.15);}
  expect(JSON.stringify(matchFixtureWorld)).toBe(before);
  if(process.env.FATIGUE_COMPARISON_REPORT)writeFileSync(process.env.FATIGUE_COMPARISON_REPORT,JSON.stringify({worldSeed:matchFixtureWorld.seed,matchSeeds:"0..255",low,high},null,2)+"\n");
},60000);
