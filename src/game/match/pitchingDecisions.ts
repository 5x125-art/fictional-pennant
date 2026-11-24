import { matchRules, pitchingDecisionJudgment as judgmentRules } from "./config";
import type { MatchResult, PitchingDecision, RunnerResponsibility, Side, Situation } from "./types";

type DecisionInput = Pick<MatchResult,
  "score" | "awayTeamId" | "homeTeamId" | "timeline" | "pitcherAppearances" | "pitchingByPlayerId">;

const outsPerInning = matchRules.outsPerHalf;
const starterWinOuts = 5 * outsPerInning;
const longReliefOuts = 3 * outsPerInning;

const opponent = (side: Side): Side => side === "away" ? "home" : "away";
const lead = ({score}: Pick<Situation, "score">, side: Side) => score[side] - score[opponent(side)];

function reliefLeadQualifies(entry: Situation, side: Side, outs: number) {
  const margin = lead(entry, side);
  const occupied = entry.bases.filter(Boolean).length;
  return margin > 0 && (margin <= occupied + 2 ||
    (margin <= 3 && outs >= outsPerInning) || outs >= longReliefOuts);
}

/** 成立済みの得点・登板記録から、試合終了後に個人記録を裁定する。 */
export function adjudicatePitchingDecisions(input: DecisionInput): PitchingDecision {
  const {score, timeline, pitcherAppearances, pitchingByPlayerId: stats} = input;
  const teams = {away: input.awayTeamId, home: input.homeTeamId};
  const winner = score.away === score.home ? null : score.away > score.home ? "away" : "home";
  const empty = {winPitcherId: null, lossPitcherId: null, savePitcherId: null,
    holdPitcherIds: [], judgment: null, decisiveRun: null};
  const unresolved = (reason: string): PitchingDecision => ({...empty, status: "unadjudicated", reason});
  const awayStarter = pitcherAppearances.find(a => a.teamId === teams.away && a.starter);
  const homeStarter = pitcherAppearances.find(a => a.teamId === teams.home && a.starter);
  if (!awayStarter || !homeStarter || pitcherAppearances.some(a =>
    !stats[a.pitcherId] || (!a.starter && !a.entry))) return unresolved("missingAppearance");

  const active = {away: awayStarter.pitcherId, home: homeStarter.pitcherId};
  let decisiveRun: PitchingDecision["decisiveRun"] = null;
  const runs: Array<{side: Side; margin: number; index: number; runner: RunnerResponsibility}> = [];
  const runsWhilePitching = new Map<string, number>();
  const appearancesById = new Map(pitcherAppearances.map(a => [a.pitcherId, a]));
  const replayed = {away: 0, home: 0};

  for (const [index, item] of timeline.entries()) {
    const side = item.event.before.half === "top" ? "away" : "home";
    const fielding = opponent(side);
    if (item.type === "pitchingChange") {
      const {incomingPitcherId, outgoingPitcherId} = item.event;
      const incoming = appearancesById.get(incomingPitcherId);
      if (active[fielding] !== outgoingPitcherId || incoming?.teamId !== teams[fielding] ||
          incoming.entryTimelineIndex !== index || appearancesById.get(outgoingPitcherId)?.exitTimelineIndex !== index)
        return unresolved("inconsistentPitchingChanges");
      active[fielding] = incomingPitcherId;
    } else if (item.type === "plateAppearance") {
      const event = item.event;
      if (event.before.score.away !== replayed.away || event.before.score.home !== replayed.home ||
          event.after.score[side] - replayed[side] !== event.scoredRuns.length ||
          event.after.score[fielding] !== replayed[fielding] ||
          active[fielding] !== event.pitcherId) return unresolved("inconsistentScoringTimeline");
      if (event.scoredRuns.length) {
        const pitcherId = event.pitcherId;
        runsWhilePitching.set(pitcherId, (runsWhilePitching.get(pitcherId) ?? 0) + event.scoredRuns.length);
      }
      for (const [runIndex, runner] of event.scoredRuns.entries()) {
        const margin = ++replayed[side] - replayed[fielding];
        runs.push({side, margin, index, runner});
        if (winner && margin === 0) decisiveRun = null;
        if (winner === side && margin === 1) {
          decisiveRun = {eventIndex: event.index, runIndex, runner, pitcherOfRecordId: active[side]};
        }
      }
    }
  }
  if (score.away !== replayed.away || score.home !== replayed.home) return unresolved("missingScoringTimeline");
  if (pitcherAppearances.some(a => !a.starter &&
    timeline[a.entryTimelineIndex ?? -1]?.type !== "pitchingChange")) return unresolved("missingPitchingChanges");

  let winPitcherId: string | null = null;
  let lossPitcherId: string | null = null;
  let savePitcherId: string | null = null;
  let judgment: PitchingDecision["judgment"] = null;
  let ruleReason: string | undefined;

  if (winner) {
    const winnerAppearances = pitcherAppearances.filter(a => a.teamId === teams[winner]);
    const loserAppearances = pitcherAppearances.filter(a => a.teamId === teams[opponent(winner)]);
    const candidate = winnerAppearances.find(a => a.pitcherId === decisiveRun?.pitcherOfRecordId);
    if (!decisiveRun || !candidate || !loserAppearances.some(a => a.pitcherId === decisiveRun.runner.responsiblePitcherId))
      return unresolved("missingDecisiveRunResponsibility");

    lossPitcherId = decisiveRun.runner.responsiblePitcherId;
    winPitcherId = candidate.pitcherId;
    const candidateStats = stats[candidate.pitcherId];
    const relief = winnerAppearances.filter(a => !a.starter &&
      (stats[a.pitcherId].pitches > 0 || stats[a.pitcherId].outs > 0));
    const reliefLine = (pitcherId: string) => ({
      pitcherId, outs: stats[pitcherId].outs, runsAllowed: stats[pitcherId].runsAllowed,
      earnedRuns: stats[pitcherId].earnedRuns, runsWhilePitching: runsWhilePitching.get(pitcherId) ?? 0,
    });
    if (candidate.starter && candidateStats.outs < starterWinOuts) {
      const ranked = relief.map(({pitcherId}) => reliefLine(pitcherId));
      const [longest, nextLongest] = [...ranked].sort((a, b) => b.outs - a.outs);
      if (!longest) return unresolved("noEligibleRelieverForShortStarter");
      if (!nextLongest || longest.outs - nextLongest.outs >= outsPerInning) {
        winPitcherId = longest.pitcherId;
        ruleReason = nextLongest ? "reliefOutsAdvantage" : "soleEligibleReliever";
      } else {
        const effectiveness = (line: typeof ranked[number]) => line.outs - judgmentRules.outsPenaltyPerRun * line.runsAllowed;
        ranked.sort((a, b) => effectiveness(b) - effectiveness(a) ||
          a.earnedRuns - b.earnedRuns || b.outs - a.outs);
        winPitcherId = ranked[0].pitcherId;
        judgment = {reason: "shortStarter", candidates: ranked};
      }
    } else if (!candidate.starter && candidateStats.outs < outsPerInning &&
        (runsWhilePitching.get(candidate.pitcherId) ?? 0) > 0) {
      const later = relief.slice(relief.indexOf(candidate) + 1).filter(a =>
        stats[a.pitcherId].outs >= judgmentRules.effectiveReliefMinOuts && stats[a.pitcherId].runsAllowed === 0);
      if (later.length) {
        winPitcherId = later[0].pitcherId;
        judgment = {reason: "briefIneffectiveRelief", candidates: [candidate, ...later].map(a => reliefLine(a.pitcherId))};
      }
    }

    const finisher = winnerAppearances.at(-1)!;
    if (!finisher.starter && finisher.entry && !finisher.exit && finisher.pitcherId !== winPitcherId &&
        stats[finisher.pitcherId].outs > 0 &&
        reliefLeadQualifies(finisher.entry, winner, stats[finisher.pitcherId].outs)) {
      savePitcherId = finisher.pitcherId;
    }
  }

  const holdPitcherIds = pitcherAppearances.filter(a => {
    const {pitcherId, entry, exit, entryTimelineIndex, exitTimelineIndex} = a;
    const outs = stats[pitcherId].outs;
    if (a.starter || !entry || entryTimelineIndex === null || outs === 0 ||
        !exit || exitTimelineIndex === null || [winPitcherId, lossPitcherId, savePitcherId].includes(pitcherId)) return false;
    const side = a.teamId === teams.away ? "away" : "home";
    const entryLead = lead(entry, side);
    const opponentRuns = runs.filter(run => run.side !== side && run.index > entryTimelineIndex);
    const lostLead = opponentRuns.some(run => run.margin >= 0 && run.index < exitTimelineIndex);
    const leadLostAfterExit = opponentRuns.some(run => run.index >= exitTimelineIndex &&
      run.margin >= 0 && run.margin <= 1 && run.runner.responsiblePitcherId === pitcherId);
    if (lostLead || leadLostAfterExit) return false;
    if (entryLead === 0) {
      return lead(exit, side) > 0 || stats[pitcherId].runsAllowed === 0;
    }
    return reliefLeadQualifies(entry, side, outs) && lead(exit, side) > 0;
  }).map(a => a.pitcherId);

  return {
    status: winner ? judgment ? "provisional" : "adjudicated" : "draw",
    reason: judgment?.reason ?? ruleReason ?? (winner ? "decisiveLead" : "tiedFinalScore"),
    winPitcherId, lossPitcherId, savePitcherId, holdPitcherIds, judgment, decisiveRun,
  };
}
