import { expect } from "vitest";
import type { MatchResult } from "../../game/match/types";
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
export function assertMatchAccounting(result: MatchResult) {
  expect(result.events.length).toBe(
    Object.values(result.pitchingByPlayerId).reduce((n, p) => n + p.outs, 0) +
      result.score.away +
      result.score.home +
      result.halfInnings.reduce((n, h) => n + h.leftOnBaseIds.length, 0),
  );
  for (const side of ["away", "home"] as const) {
    const teamId = side === "away" ? result.awayTeamId : result.homeTeamId;
    const logs = result.events.filter((e) => e.battingTeamId === teamId);
    const ids = [...new Set(logs.map((e) => e.batterId))];
    const stats = ids.map((id) => result.battingByPlayerId[id]);
    expect(sum(stats.map((s) => s.runs))).toBe(result.score[side]);
    expect(sum(stats.map((s) => s.runsBattedIn))).toBe(sum(logs.map(e => e.runsBattedIn)));
    expect(sum(stats.map(s => s.runsBattedIn))).toBeLessThanOrEqual(result.score[side]);
    expect(sum(result.innings.map((i) => i[side] ?? 0))).toBe(
      result.score[side],
    );
    expect(sum(stats.map((s) => s.plateAppearances))).toBe(logs.length);
    for (const s of stats) {
      expect(s.hits).toBe(s.singles + s.doubles + s.triples + s.homeRuns);
      expect(s.plateAppearances).toBe(s.atBats + s.walks + s.hitByPitches + s.sacrificeBunts + s.sacrificeFlies);
      expect(s.strikeouts + s.hits).toBeLessThanOrEqual(s.atBats);
      expect(
        s.stolenBases + s.caughtStealing,
      ).toBe(0);
    }
    const pitcher = result.pitchingByPlayerId[logs[0].pitcherId];
    expect(pitcher.outs).toBe(sum(logs.map(e => e.outsRecorded)));
    expect(pitcher.outs).toBe(
      sum(
        result.halfInnings
          .filter((h) => h.half === (side === "away" ? "top" : "bottom"))
          .map((h) => h.outs),
      ),
    );
    expect(pitcher.hitsAllowed).toBe(sum(stats.map((s) => s.hits)));
    expect(pitcher.homeRunsAllowed).toBe(sum(stats.map((s) => s.homeRuns)));
    expect(pitcher.walks).toBe(sum(stats.map((s) => s.walks)));
    expect(pitcher.hitBatters).toBe(sum(stats.map((s) => s.hitByPitches)));
    expect(pitcher.strikeouts).toBe(sum(stats.map((s) => s.strikeouts)));
    expect(pitcher.pitches).toBe(sum(logs.map((e) => e.estimatedPitches)));
    expect(pitcher.runsAllowed).toBe(result.score[side]);
    expect(pitcher.earnedRuns).toBeGreaterThanOrEqual(0);
    expect(pitcher.earnedRuns).toBeLessThanOrEqual(pitcher.runsAllowed);
    if (!logs.some(e => e.outcome === "reachedOnError")) expect(pitcher.earnedRuns).toBe(pitcher.runsAllowed);
  }
  for (const [id, stat] of Object.entries(result.fieldingByPlayerId)) {
    const logs = result.events.filter(e => e.defense?.fielder.id === id);
    expect(stat.chances).toBe(logs.length);
    expect(stat.errors).toBe(logs.filter(e => e.defense?.error).length);
    expect(stat.hitsPrevented).toBe(logs.filter(e => e.defense?.hitPrevented).length);
    expect(stat.errors).toBe(stat.catchingErrors + stat.throwingErrors);
  }
  for (const event of result.events) {
    const before = event.before.bases.filter((id) => id !== null),
      after = event.after.bases.filter((id) => id !== null);
    const completed = [
      ...after,
      ...event.scoredPlayerIds,
      ...event.movements.filter(m => m.to === "out").map(m => m.playerId),
    ];
    expect(new Set(completed).size).toBe(completed.length);
    expect([...completed].sort()).toEqual([...before, event.batterId].sort());
    expect(event.after.outs - event.before.outs).toBe(
      event.outsRecorded,
    );
    expect(event.movements.filter(m => m.to === "out")).toHaveLength(event.outsRecorded);
    expect(event.after.outs).toBeLessThanOrEqual(3);
    if (event.after.outs === 3) {
      const third = event.playSequence.filter(m => m.type === "out")[2-event.before.outs];
      if (third.outKind !== "tag") expect(event.scoredPlayerIds).toEqual([]);
    }
    let outs = event.before.outs;
    const validScores: string[] = [];
    for (const moment of event.playSequence) {
      if (outs === 3) break;
      if (moment.type === "score") validScores.push(moment.playerId);
      else if (++outs === 3 && moment.outKind !== "tag") validScores.length = 0;
    }
    expect(event.scoredPlayerIds).toEqual(validScores);
    expect(event.runsBattedIn).toBe(event.outcome === "reachedOnError" ? 0 : event.scoredPlayerIds.length);
    const side = event.half === "top" ? "away" : "home";
    expect(event.after.score[side] - event.before.score[side]).toBe(
      event.scoredPlayerIds.length,
    );
  }
}
