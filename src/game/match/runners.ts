import {
  playOutcomes,
  MatchSimulationError,
  type Bases,
  type RunnerMovement,
  type PlateAppearanceOutcome,
} from "./types";
export const isOut = (outcome: PlateAppearanceOutcome) =>
  ["strikeout", "groundOut", "flyOut", "groundDoublePlay", "sacrificeFly", "sacrificeBunt"].includes(outcome);
export const isHit = (outcome: PlateAppearanceOutcome) =>
  ["single", "double", "triple", "homeRun"].includes(outcome);
const hitBases = { single: 1, double: 2, triple: 3, homeRun: 4 } as const;
const hitByBases = ["single", "double", "triple", "homeRun"] as const;
export interface RunnerTransition {
  readonly outcome: PlateAppearanceOutcome;
  readonly bases: Bases;
  readonly scoredPlayerIds: readonly string[];
  readonly batterOut: boolean;
}
/** 走者IDを保ったまま決定的に進塁。サヨナラ非HRは勝越点に必要な塁打までで停止する。 */
function advanceBasicRunners(
  bases: Bases,
  batterId: string,
  drawnOutcome: PlateAppearanceOutcome,
  runsToWin?: number,
): RunnerTransition {
  if (
    !Array.isArray(bases) ||
    bases.length !== 3 ||
    typeof batterId !== "string" ||
    !batterId ||
    bases.some((id) => id !== null && (typeof id !== "string" || !id)) ||
    !playOutcomes.includes(drawnOutcome)
  )
    throw new MatchSimulationError("打席結果または塁状態が不正です。");
  const occupants = bases.filter((id): id is string => id !== null);
  if (new Set([...occupants, batterId]).size !== occupants.length + 1)
    throw new MatchSimulationError("走者・打者が重複しています。");
  if (
    runsToWin !== undefined &&
    (!Number.isSafeInteger(runsToWin) || runsToWin < 1)
  )
    throw new MatchSimulationError("サヨナラまでの必要得点が不正です。");
  if (isOut(drawnOutcome))
    return {
      outcome: drawnOutcome,
      bases: [bases[0], bases[1], bases[2]],
      scoredPlayerIds: [],
      batterOut: true,
    };
  const next: [string | null, string | null, string | null] = [
      bases[0],
      bases[1],
      bases[2],
    ],
    scored: string[] = [];
  if (drawnOutcome === "walk" || drawnOutcome === "hitByPitch") {
    if (bases[0]) {
      if (bases[1]) {
        if (bases[2]) scored.push(bases[2]);
        next[2] = bases[1];
      }
      next[1] = bases[0];
    }
    next[0] = batterId;
    return {
      outcome: drawnOutcome,
      bases: next,
      scoredPlayerIds: scored,
      batterOut: false,
    };
  }
  let distance: number = hitBases[drawnOutcome as keyof typeof hitBases];
  if (distance !== 4 && runsToWin !== undefined) {
    const candidates = [2, 1, 0].filter(
      (i) => bases[i] !== null && i + 1 + distance >= 4,
    );
    if (candidates.length >= runsToWin)
      distance = 4 - (candidates[runsToWin - 1] + 1);
  }
  next.fill(null);
  for (let i = 2; i >= 0; i--) {
    const id = bases[i];
    if (!id) continue;
    const target = i + distance;
    if (target >= 3) scored.push(id);
    else next[target] = id;
  }
  if (distance === 4) scored.push(batterId);
  else next[distance - 1] = batterId;
  return {
    outcome: hitByBases[distance - 1],
    bases: next,
    scoredPlayerIds: scored,
    batterOut: false,
  };
}

export interface PlayTransition extends RunnerTransition {
  readonly outsRecorded: number;
  readonly movements: readonly RunnerMovement[];
}
/** 同一プレーの全走者を一度ずつ処理する。第3アウトがフォース／打者アウトなら得点なし。 */
export function advanceRunners(
  bases: Bases, batterId: string, drawnOutcome: PlateAppearanceOutcome,
  runsToWin?: number, outsBefore = 0,
): PlayTransition {
  if (!Number.isInteger(outsBefore) || outsBefore < 0 || outsBefore > 2)
    throw new MatchSimulationError("プレー前アウト数が不正です。");
  // 共通の入力・ID重複検証。新プレーも通常アウトとして検証してから処理する。
  const special = ["groundDoublePlay", "sacrificeFly", "sacrificeBunt"].includes(drawnOutcome);
  let moved = advanceBasicRunners(bases, batterId, special ? "groundOut" : drawnOutcome, runsToWin);
  let runnerOut: string | null = null;
  if (special) {
    const legal = outsBefore < 2 && (
      drawnOutcome === "groundDoublePlay" ? bases[0] !== null :
      drawnOutcome === "sacrificeFly" ? bases[2] !== null : bases.some(id => id !== null));
    if (!legal) throw new MatchSimulationError("未対応の成立条件です（併殺・犠飛・犠打）。");
    const next: [string | null, string | null, string | null] = [...bases];
    const scored: string[] = [];
    if (drawnOutcome === "groundDoublePlay") {
      runnerOut = bases[0];
      next[0] = null;
      // 暫定：他走者は保持し、併殺では進塁・得点させない。
    } else if (drawnOutcome === "sacrificeFly") {
      scored.push(bases[2]!);
      next[2] = null;
    } else {
      next.fill(null);
      for (let i = 2; i >= 0; i--) {
        if (!bases[i]) continue;
        if (i === 2) scored.push(bases[i]!);
        else next[i + 1] = bases[i];
      }
    }
    moved = { outcome: drawnOutcome, bases: next, scoredPlayerIds: scored, batterOut: true };
  }
  const movements: RunnerMovement[] = [];
  for (const [i, id] of [...bases, batterId].entries()) {
    if (id === null) continue;
    const from = (i === 3 ? 0 : i + 1) as 0 | 1 | 2 | 3;
    if (id === runnerOut) movements.push({ playerId: id, from, to: "out", outKind: "force" });
    else if (id === batterId && moved.batterOut)
      movements.push({ playerId: id, from, to: "out", outKind: "batter" });
    else if (moved.scoredPlayerIds.includes(id)) movements.push({ playerId: id, from, to: "score" });
    else movements.push({ playerId: id, from, to: (moved.bases.indexOf(id) + 1) as 1 | 2 | 3 });
  }
  return { ...moved, outsRecorded: movements.filter(m => m.to === "out").length, movements };
}
