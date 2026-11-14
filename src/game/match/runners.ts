import {
  outcomes,
  MatchSimulationError,
  type Bases,
  type PlateAppearanceOutcome,
} from "./types";
export const isOut = (outcome: PlateAppearanceOutcome) =>
  ["strikeout", "groundOut", "flyOut"].includes(outcome);
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
export function advanceRunners(
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
    !outcomes.includes(drawnOutcome)
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
