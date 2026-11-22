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
    const steals = result.stealingEvents.filter(e => e.battingTeamId === teamId);
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
      const id = ids[stats.indexOf(s)];
      expect(s.stolenBases).toBe(steals.filter(e => e.candidate?.id === id && e.action === "safe").length);
      expect(s.caughtStealing).toBe(steals.filter(e => e.candidate?.id === id && e.action === "out").length);
    }
    const pitcherIds = result.pitcherAppearances.filter(a => a.teamId === logs[0].fieldingTeamId).map(a => a.pitcherId);
    const pitcherStats = pitcherIds.map(id => result.pitchingByPlayerId[id]);
    const pitcher = Object.fromEntries(Object.keys(pitcherStats[0]).map(key => [key,sum(pitcherStats.map(s => s[key as keyof typeof s]))])) as unknown as typeof pitcherStats[number];
    expect(pitcher.outs).toBe(sum(logs.map(e => e.outsRecorded)) + sum(steals.map(e => e.outsRecorded)));
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
    expect(pitcher.pitches).toBe(sum(logs.map((e) => e.estimatedPitches)) + sum(steals.map(e => e.estimatedPitches)));
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
  const paTimeline = result.timeline.filter(e => e.type === "plateAppearance");
  const stealingTimeline = result.timeline.filter(e => e.type === "stealing");
  expect(paTimeline).toHaveLength(result.events.length);
  expect(stealingTimeline).toHaveLength(result.stealingEvents.length);
  paTimeline.forEach((entry,i) => expect(entry.event).toBe(result.events[i]));
  stealingTimeline.forEach((entry,i) => expect(entry.event).toBe(result.stealingEvents[i]));
  for (const [id,stat] of Object.entries(result.pitchingByPlayerId)) {
    const logs = result.timeline.filter(e => e.type !== "pitchingChange").filter(e => e.event.pitcherId === id);
    const plate = result.events.filter(e => e.pitcherId === id);
    expect(stat.outs).toBe(sum(logs.map(e => e.event.outsRecorded)));
    expect(stat.hitsAllowed).toBe(plate.filter(e => ["single","double","triple","homeRun"].includes(e.outcome)).length);
    expect(stat.homeRunsAllowed).toBe(plate.filter(e => e.outcome === "homeRun").length);
    expect(stat.walks).toBe(plate.filter(e => e.outcome === "walk").length);
    expect(stat.strikeouts).toBe(plate.filter(e => e.outcome === "strikeout").length);
    expect(stat.hitBatters).toBe(plate.filter(e => e.outcome === "hitByPitch").length);
    expect(stat.runsAllowed).toBe(result.events.flatMap(e => e.scoredRuns).filter(r => r.responsiblePitcherId === id).length);
    expect(stat.earnedRuns).toBeGreaterThanOrEqual(0);
    expect(stat.earnedRuns).toBeLessThanOrEqual(stat.runsAllowed);
    expect(stat.games).toBe(1);
    expect(stat.starts).toBe(Number(result.pitcherAppearances.find(a => a.pitcherId === id)!.starter));
    let pitches = 0, fatigue = 0;
    for (const {event} of logs) {
      const f = event.pitcherFatigue;
      expect(f.before.pitcherId).toBe(id);
      expect(f.after.pitcherId).toBe(id);
      expect(f.before.pitches).toBe(pitches);
      pitches += event.estimatedPitches;
      expect(f.after.pitches).toBe(pitches);
      expect(f.before.fatigue).toBe(fatigue);
      expect(f.after.fatigue).toBeGreaterThanOrEqual(fatigue);
      expect(f.after.fatigue).toBeLessThanOrEqual(100);
      fatigue = f.after.fatigue;
    }
    expect(pitches).toBe(stat.pitches);
    if (logs.length) expect(result.pitcherFatigueByPlayerId[id]).toBe(logs.at(-1)!.event.pitcherFatigue.after);
    else expect(result.pitcherFatigueByPlayerId[id]).toMatchObject({pitches:0,fatigue:0});
  }
  expect(result.stealingEvents.map(e => e.index)).toEqual(result.stealingEvents.map((_,i) => i));
  let completedAppearances = 0;
  for (let i = 0; i < result.timeline.length; i++) {
    const entry = result.timeline[i], previous = result.timeline[i-1];
    const before = entry.event.before;
    if (entry.type === "plateAppearance") expect(entry.event.index).toBe(completedAppearances++);
    else expect(entry.event.plateAppearanceIndex).toBe(completedAppearances);
    if (previous && previous.event.after.inning === before.inning && previous.event.after.half === before.half)
      expect(before).toEqual(previous.event.after);
    if (entry.type === "pitchingChange") {
      const e = entry.event;
      expect(e.after).toBe(e.before);
      expect(e.estimatedPitches+e.outsRecorded).toBe(0);
      expect(e.incomingFatigue).toMatchObject({pitcherId:e.incomingPitcherId,pitches:0,fatigue:0});
      expect(e.outgoingPitcherId).not.toBe(e.incomingPitcherId);
      expect(e.responsibilities.map(r => r.playerId).sort()).toEqual(e.before.bases.filter(Boolean).sort());
      expect(result.timeline[i+1]?.type).not.toBe("pitchingChange");
      expect(result.timeline[i+1]?.event.pitcherId).toBe(e.incomingPitcherId);
    }
    if (entry.type === "stealing") {
      const e = entry.event;
      expect(e.after.nextBatterIndex).toEqual(before.nextBatterIndex);
      expect(e.after.score).toEqual(before.score);
      expect(e.after.outs-before.outs).toBe(e.outsRecorded);
      expect(e.outsRecorded).toBe(e.action === "out" ? 1 : 0);
      expect(e.estimatedPitches).toBe(e.endedHalfInning ? 1 : 0);
      expect(e.movements).toHaveLength(e.attempted ? 1 : 0);
      expect(e.responsibilities.map(r => r.playerId).sort()).toEqual(e.after.bases.filter(Boolean).sort());
      expect([...e.after.bases.filter(Boolean), ...e.movements.filter(m => m.to === "out").map(m => m.playerId)].sort()).toEqual([...before.bases.filter(Boolean)].sort());
      expect(new Set(e.after.bases.filter(Boolean)).size).toBe(e.after.bases.filter(Boolean).length);
      if (e.attempted) {
        expect(e.candidate).not.toBeNull();
        expect(before.bases[e.candidate!.from-1]).toBe(e.candidate!.id);
        expect(before.bases[e.candidate!.to-1]).toBeNull();
      }
      if (e.endedHalfInning) {
        expect(e.after.outs).toBe(3);
        if (result.timeline[i+1]) expect(result.timeline[i+1].event.before.half !== before.half || result.timeline[i+1].event.before.inning !== before.inning).toBe(true);
      } else {
        expect(result.timeline[i+1]?.type).toBe("plateAppearance");
        expect(result.timeline[i+1]?.event.batterId).toBe(e.batterId);
      }
    }
  }
  expect(new Set(result.pitcherAppearances.map(a => a.pitcherId)).size).toBe(result.pitcherAppearances.length);
  expect(Object.keys(result.pitchingByPlayerId).sort()).toEqual(result.pitcherAppearances.map(a => a.pitcherId).sort());
  expect(result.timeline.filter(e => e.type === "pitchingChange").map(e => e.event)).toEqual(result.pitchingChanges);
  if (result.pitchingChanges.length) {
    expect(result.pitchingDecision.status).toBe("unadjudicated");
    for (const p of Object.values(result.pitchingByPlayerId)) expect(p.wins+p.losses+p.saves+p.holds).toBe(0);
  }
  for (const event of result.events) {
    expect(event.scoredRuns.map(r => r.playerId)).toEqual(event.scoredPlayerIds);
    expect(new Set(event.scoredRuns.map(r => r.token)).size).toBe(event.scoredRuns.length);
    expect(event.responsibilities.map(r => r.playerId).sort()).toEqual(event.after.bases.filter(Boolean).sort());
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
