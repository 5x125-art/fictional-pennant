import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { teams } from "../data/teams";
import { simulateMatch, stealingProbabilities, type StealCatcher, type StealRunner } from "../game/match";
import { SeededRandom } from "../game/random/seededRandom";
import { matchFixture, matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";

it("走力・盗塁能力・起用捕手肩力を個別変更し各256試合を比較", () => {
  const before = JSON.stringify(matchFixtureWorld);
  const sample = (ability: "speed" | "stealing" | "catcherArm", value: number) => {
    let attempts=0, successes=0, outs=0, runs=0, hits=0, atBats=0, homeRuns=0, extraAdvanceSuccesses=0, baserunningOuts=0, errors=0, hitsPrevented=0, earnedRuns=0, extras=0, draws=0;
    for (let seed=0;seed<256;seed++) {
      const input = matchFixture(seed,teams[seed%12].id,teams[((seed%12)+1+(Math.floor(seed/12)%11))%12].id);
      const catcherIds = new Set([input.away,input.home].map(t => t.battingOrder.find(e => e.position==="C")!.playerId));
      const players = input.players.map(p => p.kind==="fielder" && (ability!=="catcherArm" || catcherIds.has(p.id)) ? {...p,abilities:{...p.abilities,[ability==="catcherArm" ? "arm" : ability]:value}} : p);
      const r = simulateMatch({...input,players});
      assertMatchAccounting(r);
      for (const e of r.stealingEvents) {attempts += Number(e.attempted); successes += Number(e.action==="safe"); outs += Number(e.action==="out");}
      runs += r.score.away+r.score.home;
      extras += Number(r.innings.length>9); draws += Number(r.winnerTeamId===null);
      for (const b of Object.values(r.battingByPlayerId)) {hits+=b.hits;atBats+=b.atBats;homeRuns+=b.homeRuns;}
      for (const e of r.events) for (const m of e.movements) {extraAdvanceSuccesses+=Number(m.extraAdvance?.action==="safe");baserunningOuts+=Number(m.extraAdvance?.action==="out");}
      for (const f of Object.values(r.fieldingByPlayerId)) {errors+=f.errors;hitsPrevented+=f.hitsPrevented;}
      for (const p of Object.values(r.pitchingByPlayerId)) earnedRuns+=p.earnedRuns;
    }
    expect(attempts).toBe(successes+outs);
    return {ability,value,games:256,attempts,successes,outs,successRate:successes/attempts,runsPerTeam:runs/512,battingAverage:hits/atBats,homeRunsPerTeam:homeRuns/512,extraAdvanceSuccesses,baserunningOuts,errors,hitsPrevented,earnedRuns,extraInningGames:extras,draws};
  };
  const speedLow=sample("speed",0),speedHigh=sample("speed",100),stealingLow=sample("stealing",0),stealingHigh=sample("stealing",100),armLow=sample("catcherArm",0),armHigh=sample("catcherArm",100);
  for (const [low,high] of [[speedLow,speedHigh],[stealingLow,stealingHigh]]) {
    expect(high.attempts).toBeGreaterThan(low.attempts);
    expect(high.successes).toBeGreaterThan(low.successes);
    expect(high.successRate).toBeGreaterThan(low.successRate);
  }
  expect(armHigh.successRate).toBeLessThan(armLow.successRate);
  expect(armHigh.outs).toBeGreaterThan(armLow.outs);
  expect(JSON.stringify(matchFixtureWorld)).toBe(before);
  if (process.env.STEALING_COMPARISON_REPORT) writeFileSync(process.env.STEALING_COMPARISON_REPORT,JSON.stringify({worldSeed:matchFixtureWorld.seed,matchSeeds:"0..255",speedLow,speedHigh,stealingLow,stealingHigh,armLow,armHigh},null,2)+"\n");
},120000);

it("同じ盗塁機会・同じ乱数の2万回比較で他能力を固定し各能力の方向を検証", () => {
  const runner:StealRunner={id:"a",speed:50,stealing:50},catcher:StealCatcher={id:"c",position:"C",arm:50,throwing:50,aptitude:50};
  const sample=(r:StealRunner,c:StealCatcher) => {
    const p=stealingProbabilities(r,c,1,0),rng=new SeededRandom(73421);
    let attempts=0,successes=0;
    for(let i=0;i<20000;i++) {const attempt=rng.next(),success=rng.next();if(attempt<p.attempt){attempts++;successes+=Number(success<p.success);}}
    return {attempts,successes,rate:successes/attempts};
  };
  for(const ability of ["speed","stealing"] as const) {
    const low=sample({...runner,[ability]:0},catcher),high=sample({...runner,[ability]:100},catcher);
    expect(high.attempts).toBeGreaterThan(low.attempts);expect(high.rate).toBeGreaterThan(low.rate);
  }
  for(const ability of ["arm","throwing","aptitude"] as const)
    expect(sample(runner,{...catcher,[ability]:100}).rate).toBeLessThan(sample(runner,{...catcher,[ability]:0}).rate);
});
