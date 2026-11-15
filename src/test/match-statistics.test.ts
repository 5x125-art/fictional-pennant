import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { teams } from "../data/teams";
import { simulateMatch } from "../game/match/simulate";
import { assertMatchAccounting } from "./helpers/matchAssertions";
import { matchFixture, matchFixtureWorld } from "./helpers/matchFixture";
it("全12球団・256シードの試合で集計整合と得点環境を確認する", () => {
  const games = 256;
  let runs = 0,
    hits = 0,
    atBats = 0,
    homeRuns = 0,
    plateAppearances = 0,
    walks = 0,
    strikeouts = 0,
    pitches = 0,
    draws = 0,
    extras = 0,
    doublePlays = 0,
    sacrificeFlies = 0;
  const before = JSON.stringify(matchFixtureWorld);
  for (let seed = 0; seed < games; seed++) {
    const away = teams[seed % 12].id,
      home = teams[((seed % 12) + 1 + (Math.floor(seed / 12) % 11)) % 12].id;
    const input = matchFixture(seed, away, home),
      result = simulateMatch(input);
    doublePlays += result.events.filter(e => e.outcome === "groundDoublePlay").length;
    sacrificeFlies += result.events.filter(e => e.outcome === "sacrificeFly").length;
    assertMatchAccounting(result);
    expect(result.events.some(e => e.outcome === "sacrificeBunt")).toBe(false);
    for (const stat of Object.values(result.battingByPlayerId)) {
      runs += stat.runs;
      hits += stat.hits;
      atBats += stat.atBats;
      homeRuns += stat.homeRuns;
      plateAppearances += stat.plateAppearances;
      walks += stat.walks;
      strikeouts += stat.strikeouts;
    }
    pitches += Object.values(result.pitchingByPlayerId).reduce(
      (n, p) => n + p.pitches,
      0,
    );
    draws += Number(result.winnerTeamId === null);
    extras += Number(result.innings.length > 9);
    expect(result.innings.length).toBeGreaterThanOrEqual(9);
    expect(result.innings.length).toBeLessThanOrEqual(12);
    for (const half of result.halfInnings)
      expect(half.outs === 3 || half.endedBy === "walkOff").toBe(true);
  }
  const report = {
    worldSeed: matchFixtureWorld.seed,
    matchSeeds: "0..255",
    games,
    teamGames: games * 2,
    runsPerTeam: runs / (games * 2),
    battingAverage: hits / atBats,
    homeRunsPerTeam: homeRuns / (games * 2),
    walkRate: walks / plateAppearances,
    strikeoutRate: strikeouts / plateAppearances,
    pitchesPerTeam: pitches / (games * 2),
    draws,
    extraInningGames: extras,
    doublePlays,
    sacrificeFlies,
  };
  console.log("Phase 3B-1 statistical sample", JSON.stringify(report));
  if (process.env.MATCH_STATISTICS_REPORT)
    writeFileSync(
      process.env.MATCH_STATISTICS_REPORT,
      JSON.stringify(report, null, 2) + "\n",
    );
  expect(doublePlays).toBeGreaterThan(0);
  expect(sacrificeFlies).toBeGreaterThan(0);
  expect(report.runsPerTeam).toBeGreaterThan(1);
  expect(report.runsPerTeam).toBeLessThan(10);
  expect(report.battingAverage).toBeGreaterThan(0.18);
  expect(report.battingAverage).toBeLessThan(0.35);
  expect(report.homeRunsPerTeam).toBeGreaterThan(0.2);
  expect(report.homeRunsPerTeam).toBeLessThan(3);
  expect(JSON.stringify(matchFixtureWorld)).toBe(before);
}, 30_000);
