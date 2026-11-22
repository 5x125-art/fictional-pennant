import type { Pitcher } from "../players/types";
import { matchPitcher } from "./validate";
import { MatchSimulationError, type AvailablePitcher, type PitchingChangeContext, type PitchingChangeDecision } from "./types";

export function availablePitcher(player: Pitcher): AvailablePitcher {
  return Object.freeze({...matchPitcher(player),role:player.role});
}

/** 既に登録・ベンチ検証済みの候補だけを選ぶ。乱数・自動判断・再登板はない。 */
export function resolvePitchingChange(context: PitchingChangeContext, decision: PitchingChangeDecision): AvailablePitcher | null {
  if (!decision || typeof decision !== "object" || Array.isArray(decision) ||
      !["continue","change"].includes(decision.action) ||
      Object.keys(decision).some(key => key !== "action" && (decision.action === "continue" || key !== "pitcherId")))
    throw new MatchSimulationError("投手交代指示が不正です。");
  if (decision.action === "continue") return null;
  const replacement = context.availablePitchers.find(p => p.id === decision.pitcherId);
  if (!replacement) throw new MatchSimulationError("投手交代先が当日の交代可能な未登板投手ではありません。");
  return replacement;
}
