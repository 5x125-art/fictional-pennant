import type { Fielder, Pitcher, FieldPosition } from "../players/types";
import { SeededRandom } from "../random/seededRandom";
import {
  estimatedPitchRanges,
  matchRules as rules,
  simulationLimits,
} from "./config";
import { defenseFielder, resolveDefense } from "./defense";
import { resolveBaserunning } from "./baserunning";
import { EarnedRunReconstruction } from "./earnedRuns";
import { drawPlateAppearance } from "./probability";
import { advanceRunners, isHit } from "./runners";
import { matchBatter, matchPitcher, validateMatchInput } from "./validate";
import {
  MatchSimulationError,
  MatchInputError,
  playOutcomes,
  type Bases,
  type EndReason,
  type HalfInningResult,
  type MatchBattingStats,
  type MatchInput,
  type MatchOptions,
  type MatchPitchingStats,
  type MatchResult,
  type MatchFieldingStats,
  type MatchTeamInput,
  type DefenseFielder,
  type ThrowingFielder,
  type PlateAppearanceEvent,
  type Side,
  type Situation,
} from "./types";
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
function emptyBatting(): Mutable<MatchBattingStats> {
  return {
    games: 1,
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    walks: 0,
    hitByPitches: 0,
    sacrificeBunts: 0,
    sacrificeFlies: 0,
    strikeouts: 0,
    runs: 0,
    runsBattedIn: 0,
    stolenBases: 0,
    caughtStealing: 0,
  };
}
function emptyPitching(): Mutable<MatchPitchingStats> {
  return {
    games: 1,
    starts: 1,
    outs: 0,
    hitsAllowed: 0,
    homeRunsAllowed: 0,
    walks: 0,
    strikeouts: 0,
    runsAllowed: 0,
    earnedRuns: 0,
    wins: 0,
    losses: 0,
    saves: 0,
    holds: 0,
    hitBatters: 0,
    pitches: 0,
  };
}
/** 1試合のローカル計算のみ。入力・セーブ・日付には書き込まない。 */
export function simulateMatch(
  input: MatchInput,
  options: MatchOptions = {},
): MatchResult {
  validateMatchInput(input);
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    (options.resolvePlateAppearance !== undefined &&
      typeof options.resolvePlateAppearance !== "function") ||
    (options.resolveDefense !== undefined && typeof options.resolveDefense !== "function") ||
    (options.resolveBaserunning !== undefined && typeof options.resolveBaserunning !== "function")
  )
    throw new MatchInputError("打席判定オプションが不正です。");
  const random = new SeededRandom(input.seed),
    initialState = random.getState();
  const teams = { away: input.away, home: input.home };
  const index = new Map(input.players.map((p) => [p.id, p]));
  const batters = {
    away: input.away.battingOrder.map((e) =>
      matchBatter(index.get(e.playerId) as Fielder),
    ),
    home: input.home.battingOrder.map((e) =>
      matchBatter(index.get(e.playerId) as Fielder),
    ),
  };
  const teamFielders = (team: MatchTeamInput) => {
    const positions = new Map<FieldPosition, DefenseFielder>();
    for (const entry of team.battingOrder) {
      if (entry.position === "DH") continue;
      positions.set(entry.position, defenseFielder(index.get(entry.playerId) as Fielder, entry.position));
    }
    return positions;
  };
  const teamThrows = (team: MatchTeamInput) => new Map<ThrowingFielder["position"], ThrowingFielder>(
    team.battingOrder.filter(e => e.position === "LF" || e.position === "CF" || e.position === "RF").map(e => {
      const p = index.get(e.playerId) as Fielder;
      const position = e.position as ThrowingFielder["position"];
      return [position, Object.freeze({id: p.id, position, arm: p.abilities.arm,
        throwing: p.abilities.throwing, aptitude: p.positionAptitudes[position]})];
    }));
  const throwers = {away: teamThrows(input.away), home: teamThrows(input.home)};
  const speeds = new Map([...batters.away, ...batters.home].map(p => [p.id, p.abilities.speed]));
  const fielders = { away: teamFielders(input.away), home: teamFielders(input.home) };
  const fieldingStats: Record<string, Mutable<MatchFieldingStats>> = Object.create(null);
  for (const side of ["away", "home"] as const) for (const f of fielders[side].values())
    fieldingStats[f.id] = {chances: 0, hitsPrevented: 0, errors: 0, catchingErrors: 0, throwingErrors: 0};
  const pitchers = {
    away: matchPitcher(index.get(input.away.startingPitcherId) as Pitcher),
    home: matchPitcher(index.get(input.home.startingPitcherId) as Pitcher),
  };
  const batting: Record<string, Mutable<MatchBattingStats>> = Object.create(
      null,
    ),
    pitching: Record<string, Mutable<MatchPitchingStats>> = Object.create(null);
  for (const side of ["away", "home"] as const) {
    for (const b of batters[side]) batting[b.id] = emptyBatting();
    pitching[pitchers[side].id] = emptyPitching();
  }
  const score = { away: 0, home: 0 },
    next = { away: 0, home: 0 };
  const innings: { inning: number; away: number; home: number | null }[] = [],
    halves: HalfInningResult[] = [],
    events: PlateAppearanceEvent[] = [];
  let finalState: Situation;
  const snapshot = (
    inning: number,
    half: "top" | "bottom",
    outs: number,
    bases: Bases,
  ): Situation =>
    Object.freeze({
      inning,
      half,
      outs,
      bases: Object.freeze([...bases]) as Bases,
      score: Object.freeze({ ...score }),
      nextBatterIndex: Object.freeze({ ...next }),
    });
  const finish = (endReason: EndReason): MatchResult => {
    const winner: Side | null =
      score.away === score.home
        ? null
        : score.away > score.home
          ? "away"
          : "home";
    if (winner) {
      const loser = winner === "away" ? "home" : "away";
      pitching[pitchers[winner].id].wins = 1;
      pitching[pitchers[loser].id].losses = 1;
    }
    return {
      engineVersion: 4,
      status: "completed",
      awayTeamId: teams.away.teamId,
      homeTeamId: teams.home.teamId,
      winnerTeamId: winner ? teams[winner].teamId : null,
      endReason,
      score: { ...score },
      innings,
      halfInnings: halves,
      battingByPlayerId: batting,
      pitchingByPlayerId: pitching,
      events,
      fieldingByPlayerId: fieldingStats,
      earnedRunMethod: "reconstructedInningApproximation",
      finalState,
      random: { seed: input.seed, initialState, finalState: random.getState() },
    };
  };
  for (let inning = 1; inning <= rules.maxInnings; inning++) {
    const frame = { inning, away: 0, home: null as number | null };
    innings.push(frame);
    for (const half of ["top", "bottom"] as const) {
      if (
        half === "bottom" &&
        inning >= rules.regulationInnings &&
        score.home > score.away
      )
        return finish(
          inning === rules.regulationInnings ? "regulation" : "extraInnings",
        );
      const side: Side = half === "top" ? "away" : "home",
        fielding: Side = side === "away" ? "home" : "away";
      if (half === "bottom") frame.home = 0;
      let bases: Bases = [null, null, null],
        outs = 0,
        appearances = 0;
      const startingRuns = score[side];
      const reconstruction = new EarnedRunReconstruction();
      let walkOff = false;
      while (outs < rules.outsPerHalf) {
        if (appearances++ >= simulationLimits.plateAppearancesPerHalf)
          throw new MatchSimulationError(
            "半イニングの計算打席数が安全上限を超えました。試合結果は確定していません。",
          );
        const batter = batters[side][next[side]],
          pitcher = pitchers[fielding];
        const before = snapshot(inning, half, outs, bases);
        const drawn = options.resolvePlateAppearance
          ? options.resolvePlateAppearance(
              Object.freeze({
                eventIndex: events.length,
                battingOrderSlot: next[side] + 1,
                batter,
                pitcher,
                before,
              }),
            )
          : drawPlateAppearance(batter, pitcher, random, before);
        if (!playOutcomes.includes(drawn) || drawn === "reachedOnError")
          throw new MatchSimulationError(
            "未対応の打席結果です。試合結果は確定していません。",
          );
        const required =
          half === "bottom" && inning >= rules.regulationInnings
            ? score.away - score.home + 1
            : undefined;
        // 固定打席だけの注入は従来の規則テストを維持。守備テストは別途注入できる。
        const defended = options.resolvePlateAppearance && !options.resolveDefense
          ? {outcome: drawn, event: null}
          : resolveDefense(drawn, fielders[fielding], random, events.length, options.resolveDefense);
        if (defended.event) {
          const ds = fieldingStats[defended.event.fielder.id];
          ds.chances++;
          ds.hitsPrevented += Number(defended.event.hitPrevented);
          ds.errors += Number(defended.event.error);
          ds.catchingErrors += Number(defended.event.errorKind === "catching");
          ds.throwingErrors += Number(defended.event.errorKind === "throwing");
        }
        const moved = options.resolvePlateAppearance && !options.resolveBaserunning
          ? advanceRunners(bases, batter.id, defended.outcome, required, outs)
          : resolveBaserunning(bases, batter.id, defended.outcome, outs, required, speeds,
              throwers[fielding], defended.event, random, events.length, options.resolveBaserunning);
        const rbi = defended.outcome === "reachedOnError" ? 0 : moved.scoredPlayerIds.length;
        reconstruction.record(String(events.length), batter.id, moved,
          defended.outcome === "reachedOnError" ? drawn : moved.outcome);
        const outcome = moved.outcome,
          runs = moved.scoredPlayerIds.length;
        const pitches = random.between(estimatedPitchRanges[drawn]);
        const bs = batting[batter.id],
          ps = pitching[pitcher.id];
        bs.plateAppearances++;
        if (!["walk", "hitByPitch", "sacrificeFly", "sacrificeBunt"].includes(outcome)) bs.atBats++;
        if (outcome === "sacrificeFly") bs.sacrificeFlies++;
        if (outcome === "sacrificeBunt") bs.sacrificeBunts++;
        if (isHit(outcome)) {
          bs.hits++;
          ps.hitsAllowed++;
          if (outcome === "single") bs.singles++;
          if (outcome === "double") bs.doubles++;
          if (outcome === "triple") bs.triples++;
          if (outcome === "homeRun") {
            bs.homeRuns++;
            ps.homeRunsAllowed++;
          }
        }
        if (outcome === "walk") {
          bs.walks++;
          ps.walks++;
        }
        if (outcome === "hitByPitch") {
          bs.hitByPitches++;
          ps.hitBatters++;
        }
        if (outcome === "strikeout") {
          bs.strikeouts++;
          ps.strikeouts++;
        }
        outs += moved.outsRecorded;
        ps.outs += moved.outsRecorded;
        for (const id of moved.scoredPlayerIds) batting[id].runs++;
        bs.runsBattedIn += rbi;
        ps.runsAllowed += runs;
        ps.pitches += pitches;
        score[side] += runs;
        frame[side] = (frame[side] ?? 0) + runs;
        bases = moved.bases;
        next[side] = (next[side] + 1) % rules.batters;
        finalState = snapshot(inning, half, outs, bases);
        events.push({
          index: events.length,
          inning,
          half,
          battingTeamId: teams[side].teamId,
          fieldingTeamId: teams[fielding].teamId,
          battingOrderSlot: before.nextBatterIndex[side] + 1,
          batterId: batter.id,
          pitcherId: pitcher.id,
          drawnOutcome: drawn,
          outcome,
          before,
          after: finalState,
          scoredPlayerIds: [...moved.scoredPlayerIds],
          runsBattedIn: rbi,
          defense: defended.event,
          estimatedPitches: pitches,
          outsRecorded: moved.outsRecorded,
          movements: moved.movements,
          playSequence: moved.playSequence,
        });
        if (
          half === "bottom" &&
          inning >= rules.regulationInnings &&
          score.home > score.away
        ) {
          walkOff = true;
          break;
        }
      }
      pitching[pitchers[fielding].id].earnedRuns += reconstruction.earnedRuns;
      halves.push({
        inning,
        half,
        runs: score[side] - startingRuns,
        outs,
        leftOnBaseIds: bases.filter((id): id is string => id !== null),
        endedBy: walkOff ? "walkOff" : "threeOuts",
      });
      if (walkOff) return finish("walkOff");
    }
    if (inning >= rules.regulationInnings && score.away !== score.home)
      return finish(
        inning === rules.regulationInnings ? "regulation" : "extraInnings",
      );
    if (inning === rules.maxInnings) return finish("twelveInningDraw");
  }
  throw new MatchSimulationError("試合の終了条件に到達できませんでした。");
}
