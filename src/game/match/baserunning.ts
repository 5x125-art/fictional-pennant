import { baserunningConfig as c } from "./config";
import { advanceRunners, scoredBeforeThirdOut, type PlayTransition } from "./runners";
import { MatchSimulationError, type DefenseEvent, type Bases, type BaserunningContext, type ExtraAdvanceEvent, type MatchOptions, type PlateAppearanceOutcome, type PlayMoment, type ThrowingFielder } from "./types";
import type { SeededRandom } from "../random/seededRandom";

export function baserunningProbabilities(context: BaserunningContext) {
  const {speed, fielder: f, target, outcome, outs, battedBall} = context;
  const a = c.attempt, o = c.out;
  const clamp = (v: number, bounds: {min: number; max: number}) => Math.max(bounds.min, Math.min(bounds.max, v));
  const base = outcome === "double" ? a.doubleToHome : target === 3 ? a.singleToThird : a.singleToHome;
  return Object.freeze({
    attempt: clamp(base + (speed-c.center)*a.speed + (f.arm-c.center)*a.arm + (outs===2 ? a.twoOuts : 0) + (battedBall==="ground" ? a.ground : 0), a),
    out: clamp(o.base + (speed-c.center)*o.speed + (f.arm-c.center)*o.arm + (f.throwing-c.center)*o.throwing + (f.aptitude-c.center)*o.aptitude + (target==="score" ? o.home : 0) + (outs===2 ? o.twoOuts : 0) + (battedBall==="ground" ? o.ground : 0), o),
  });
}

/** 基本進塁は先に確保。先行走者からの時間順で、追加進塁だけを解決する。
 * decideは実試合の抽選と、失策なし再構成への既存結果の再適用で共有する。 */
export function advanceOnHit(
  bases: Bases, batterId: string, outcome: PlateAppearanceOutcome, outsBefore: number,
  runsToWin: number | undefined,
  decide: (runnerId: string, from: 1 | 2, target: 3 | "score", outs: number) => ExtraAdvanceEvent | undefined,
): PlayTransition {
  const basic = advanceRunners(bases, batterId, outcome, runsToWin, outsBefore);
  if (outcome !== "single" && outcome !== "double") return basic;
  const next: [string | null, string | null, string | null] = [...basic.bases];
  const movements = basic.movements.map(m => ({...m}));
  const sequence: PlayMoment[] = [];
  let outs = outsBefore, runs = 0;
  // 打者は通常の安打到達のみ。走者を追い越さず、空いた塁だけを狙う。
  for (let i = 2; i >= 0; i--) {
    const id = bases[i];
    if (!id) continue;
    const movement = movements.find(m => m.playerId === id)!;
    if (movement.to === "score") {
      sequence.push({playerId: id, type: "score"});
      runs++;
      continue;
    }
    const target = outcome === "single" && i === 0 ? 3 :
      (outcome === "single" && i === 1) || (outcome === "double" && i === 0) ? "score" : null;
    if (target === null) continue;
    movement.extraAdvanceTarget = target;
    movement.extraAdvanceAttempted = false;
    if (outs >= 3) { movement.advanceBlocked = "thirdOut"; continue; }
    if (runsToWin !== undefined && runs >= runsToWin) { movement.advanceBlocked = "walkOff"; continue; }
    if (target === 3 && next[2] !== null) { movement.advanceBlocked = "occupied"; continue; }
    const extra = decide(id, (i+1) as 1 | 2, target, outs);
    if (!extra) continue;
    movement.extraAdvance = extra;
    movement.extraAdvanceAttempted = extra.attempted;
    if (extra.action === "hold") continue;
    const current = next.indexOf(id);
    if (current < 0) throw new MatchSimulationError("追加進塁の走者が塁上に存在しません。");
    next[current] = null;
    if (extra.action === "out") {
      movement.to = "out";
      movement.outKind = "tag";
      sequence.push({playerId: id, type: "out", outKind: "tag"});
      outs++;
    } else if (target === "score") {
      movement.to = "score";
      sequence.push({playerId: id, type: "score"});
      runs++;
    } else {
      next[2] = id;
      movement.to = 3;
    }
  }
  return {...basic, bases: next, movements, playSequence: sequence,
    scoredPlayerIds: scoredBeforeThirdOut(sequence, outsBefore), outsRecorded: outs-outsBefore};
}

export function resolveBaserunning(
  bases: Bases, batterId: string, outcome: PlateAppearanceOutcome, outs: number,
  runsToWin: number | undefined, speeds: ReadonlyMap<string, number>,
  fielders: ReadonlyMap<ThrowingFielder["position"], ThrowingFielder>,
  defense: DefenseEvent | null, random: SeededRandom, eventIndex: number,
  override?: MatchOptions["resolveBaserunning"],
): PlayTransition {
  // 送球担当は同一打球で共通。対象走者がいなければ乱数は消費しない。
  let fielder: ThrowingFielder | undefined;
  let ball = defense?.battedBall;
  const position = defense?.fielder.position;
  if (position === "LF" || position === "CF" || position === "RF") fielder = fielders.get(position);
  return advanceOnHit(bases, batterId, outcome, outs, runsToWin, (runnerId, from, target, currentOuts) => {
    ball ??= outcome === "single" && random.next() < c.singleGroundShare ? "ground" : "fly";
    fielder ??= fielders.get(random.pick(c.outfieldPositions));
    if (!fielder || speeds.get(runnerId) === undefined) throw new MatchSimulationError("走塁・外野送球の担当選手が存在しません。");
    const context: BaserunningContext = Object.freeze({eventIndex, runnerId, from, target,
      outcome: outcome as "single" | "double", outs: currentOuts, battedBall: ball,
      speed: speeds.get(runnerId)!, fielder});
    const probabilities = baserunningProbabilities(context);
    const action = override ? override(context) : random.next() >= probabilities.attempt ? "hold" :
      random.next() < probabilities.out ? "out" : "safe";
    if (!["hold", "safe", "out"].includes(action)) throw new MatchSimulationError("走塁注入結果が不正です（hold／safe／outのみ）。");
    return Object.freeze({...context, probabilities, action, attempted: action !== "hold", outPlayerId: action === "out" ? runnerId : null});
  });
}
