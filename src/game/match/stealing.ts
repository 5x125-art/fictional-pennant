import { stealingConfig as c } from "./config";
import { MatchSimulationError, type Bases, type MatchOptions, type RunnerMovement, type StealCandidate, type StealCatcher, type StealRunner, type StealingContext, type StealingDecision } from "./types";
import type { SeededRandom } from "../random/seededRandom";

function checkState(bases: Bases, outs: number) {
  if (!Array.isArray(bases) || bases.length !== 3 || bases.some(id => id !== null && (typeof id !== "string" || !id)) ||
      new Set(bases.filter(id => id !== null)).size !== bases.filter(id => id !== null).length ||
      !Number.isInteger(outs) || outs < 0 || outs > 2)
    throw new MatchSimulationError("盗塁前の塁状態・アウト数が不正です。");
}

function validateDecision(decision: StealingDecision) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision) ||
      !["hold", "safe", "out"].includes(decision.action) ||
      Object.keys(decision).some(key => key !== "action" && (decision.action === "hold" || key !== "runnerId")) ||
      (decision.action !== "hold" && (typeof decision.runnerId !== "string" || !decision.runnerId)))
    throw new MatchSimulationError("盗塁注入結果が不正です。");
}

/** 試行と試行時の成功を別に計算する。方針倍率は純粋関数の引数に留め、保存型へ追加しない。 */
export function stealingProbabilities(runner: StealRunner, catcher: StealCatcher, from: 1 | 2, outs: number, attemptMultiplier: number = c.attemptMultiplier) {
  if (![runner.speed, runner.stealing, catcher.arm, catcher.throwing, catcher.aptitude].every(v => Number.isInteger(v) && v >= 0 && v <= 100) ||
      catcher.position !== "C" || (from !== 1 && from !== 2) || !Number.isInteger(outs) || outs < 0 || outs > 2 ||
      !Number.isFinite(attemptMultiplier) || attemptMultiplier < 0)
    throw new MatchSimulationError("盗塁能力・確率条件が不正です。");
  const a = c.attempt, s = c.success;
  const speed = runner.speed-c.center, stealing = runner.stealing-c.center;
  const arm = catcher.arm-c.center;
  const clamp = (v: number, bounds: {min: number; max: number}) => Math.max(bounds.min, Math.min(bounds.max, v));
  return Object.freeze({
    attempt: attemptMultiplier === 0 ? 0 : clamp(((from===1 ? a.second : a.third) + speed*a.speed + stealing*a.stealing + arm*a.arm + (outs===2 ? a.twoOuts : 0))*attemptMultiplier, a),
    success: clamp(s.base + speed*s.speed + stealing*s.stealing + arm*s.arm + (catcher.throwing-c.center)*s.throwing + (catcher.aptitude-c.center)*s.aptitude + (from===2 ? s.third : 0), s),
  });
}

export function stealingCandidates(bases: Bases, outs: number, runners: ReadonlyMap<string, StealRunner>, catcher: StealCatcher): readonly StealCandidate[] {
  checkState(bases, outs);
  const candidates: StealCandidate[] = [];
  for (const from of [1,2] as const) {
    const id = bases[from-1];
    if (!id || bases[from] !== null) continue;
    const runner = runners.get(id);
    if (!runner || runner.id !== id) throw new MatchSimulationError("盗塁候補の走者能力が存在しません。");
    // 入力の未知フィールドはコピーしない。
    const copied = {id, speed: runner.speed, stealing: runner.stealing};
    candidates.push(Object.freeze({...copied, from, to: (from+1) as 2 | 3, probabilities: stealingProbabilities(copied, catcher, from, outs)}));
  }
  return Object.freeze(candidates);
}

/** 両候補があれば試行×成功の期待値が大きい方。等値なら先行走者。重盗はしない。 */
export function resolveStealing(context: StealingContext, random: SeededRandom, override?: MatchOptions["resolveStealing"]) {
  const preferred = [...context.candidates].sort((a,b) =>
    b.probabilities.attempt*b.probabilities.success - a.probabilities.attempt*a.probabilities.success || b.from-a.from)[0] ?? null;
  const decision = override ? override(context) : !preferred || random.next() >= preferred.probabilities.attempt
    ? {action: "hold" as const} : {action: random.next() < preferred.probabilities.success ? "safe" as const : "out" as const, runnerId: preferred.id};
  validateDecision(decision);
  const candidate = decision.action === "hold" ? preferred : context.candidates.find(c => c.id === decision.runnerId);
  if (decision.action !== "hold" && !candidate)
    throw new MatchSimulationError("盗塁注入の走者が成立条件に対応していません。");
  return {action: decision.action, candidate: candidate ?? null};
}

/** 打者を含めない走者遷移。元塁・目標塁・結果を境界で検証する。 */
export function applyStealing(bases: Bases, outs: number, from: 1 | 2, decision: StealingDecision): {bases: Bases; outsRecorded: 0 | 1; movements: readonly RunnerMovement[]} {
  checkState(bases, outs);
  if (from !== 1 && from !== 2) throw new MatchSimulationError("盗塁遷移が不正です。");
  validateDecision(decision);
  const next: [string | null, string | null, string | null] = [...bases];
  if (decision.action === "hold") {
    return {bases: next, outsRecorded: 0, movements: []};
  }
  if (!bases[from-1] || bases[from-1] !== decision.runnerId || bases[from] !== null)
    throw new MatchSimulationError("盗塁の走者・目標塁が成立条件に対応していません。");
  next[from-1] = null;
  if (decision.action === "safe") next[from] = decision.runnerId;
  return {bases: next, outsRecorded: decision.action === "out" ? 1 : 0, movements: [{playerId: decision.runnerId, from,
    to: decision.action === "safe" ? (from+1) as 2 | 3 : "out", ...(decision.action === "out" ? {outKind: "tag" as const} : {})}]};
}
