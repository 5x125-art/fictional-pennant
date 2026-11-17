import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { teams } from "../data/teams";
import { simulateMatch } from "../game/match";
import { matchFixture, matchFixtureWorld } from "./helpers/matchFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";

it("走力だけ／実スタメン外野手の肩力だけを変更して各256試合を比較", () => {
  const sample = (ability: "speed" | "arm", value: number) => {
    let attempts = 0, successes = 0, outs = 0, runs = 0, errors = 0, hitsPrevented = 0, earnedRuns = 0, hits = 0, atBats = 0, homeRuns = 0;
    for (let seed=0; seed<256; seed++) {
      const input = matchFixture(seed, teams[seed%12].id, teams[((seed%12)+1+(Math.floor(seed/12)%11))%12].id);
      const outfieldIds = new Set([...input.away.battingOrder, ...input.home.battingOrder].filter(e => ["LF", "CF", "RF"].includes(e.position)).map(e => e.playerId));
      const players = input.players.map(p => p.kind === "fielder" && (ability === "speed" || outfieldIds.has(p.id)) ? {...p, abilities: {...p.abilities, [ability]: value}} : p);
      const r = simulateMatch({...input, players});
      assertMatchAccounting(r);
      for (const e of r.events) for (const m of e.movements) {
        attempts += Number(m.extraAdvance?.attempted === true);
        successes += Number(m.extraAdvance?.action === "safe");
        outs += Number(m.extraAdvance?.action === "out");
      }
      runs += r.score.away+r.score.home;
      for (const f of Object.values(r.fieldingByPlayerId)) { errors += f.errors; hitsPrevented += f.hitsPrevented; }
      for (const p of Object.values(r.pitchingByPlayerId)) earnedRuns += p.earnedRuns;
      for (const b of Object.values(r.battingByPlayerId)) { hits += b.hits; atBats += b.atBats; homeRuns += b.homeRuns; }
    }
    expect(attempts).toBe(successes+outs);
    return {ability, value, games: 256, attempts, successes, outs, outRate: outs/attempts, runsPerTeam: runs/512, battingAverage: hits/atBats, homeRunsPerTeam: homeRuns/512, errors, hitsPrevented, earnedRuns};
  };
  const before = JSON.stringify(matchFixtureWorld);
  const speedLow = sample("speed",0), speedHigh = sample("speed",100), armLow = sample("arm",0), armHigh = sample("arm",100);
  expect(speedHigh.attempts).toBeGreaterThan(speedLow.attempts);
  expect(speedHigh.successes).toBeGreaterThan(speedLow.successes);
  expect(speedHigh.outRate).toBeLessThan(speedLow.outRate);
  expect(armHigh.outRate).toBeGreaterThan(armLow.outRate);
  expect(armHigh.outs).toBeGreaterThan(armLow.outs);
  expect(armHigh.successes).toBeLessThan(armLow.successes);
  expect(JSON.stringify(matchFixtureWorld)).toBe(before);
  if (process.env.BASERUNNING_COMPARISON_REPORT) writeFileSync(process.env.BASERUNNING_COMPARISON_REPORT, JSON.stringify({worldSeed: matchFixtureWorld.seed, matchSeeds: "0..255", speedLow, speedHigh, armLow, armHigh},null,2)+"\n");
}, 60000);
