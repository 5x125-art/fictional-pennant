import type { FieldPosition, Fielder } from "../players/types";
import type { SeededRandom } from "../random/seededRandom";
import { defenseConfig as c } from "./config";
import { MatchSimulationError, type DefenseAction, type DefenseContext, type DefenseEvent, type DefenseFielder, type MatchOptions, type PlateAppearanceOutcome } from "./types";

export function defenseProbabilities(fielder: DefenseFielder) {
  const clamp = (v: number, range: {min: number; max: number}) => Math.max(range.min, Math.min(range.max, v));
  const catching = fielder.catching - c.center;
  const throwing = fielder.throwing - c.center;
  const aptitude = fielder.aptitude - c.center;
  return {
    hitPrevention: clamp(c.hitPrevention.base + catching * c.hitPrevention.catching + aptitude * c.hitPrevention.aptitude, c.hitPrevention),
    catchingError: clamp(c.catchingError.base + catching * c.catchingError.catching + aptitude * c.catchingError.aptitude, c.catchingError),
    throwingError: clamp(c.throwingError.base + throwing * c.throwingError.throwing + aptitude * c.throwingError.aptitude, c.throwingError),
  };
}
/** 試合前に検証済みのスタメンから、使う現在能力だけをコピーする。 */
export function defenseFielder(player: Fielder, position: FieldPosition): DefenseFielder {
  return Object.freeze({id: player.id, position, catching: player.abilities.catching, throwing: player.abilities.throwing, aptitude: player.positionAptitudes[position]});
}
export function resolveDefense(
  drawn: PlateAppearanceOutcome,
  fielders: ReadonlyMap<FieldPosition, DefenseFielder>,
  random: SeededRandom,
  eventIndex: number,
  override?: MatchOptions["resolveDefense"],
): {outcome: PlateAppearanceOutcome; event: DefenseEvent | null} {
  const hit = ["single", "double", "triple"].includes(drawn);
  if (!hit && drawn !== "groundOut" && drawn !== "flyOut") return {outcome: drawn, event: null};
  const battedBall = drawn === "groundOut" || (drawn === "single" && random.next() < c.singleGroundShare) ? "ground" : "fly";
  const position = random.pick(battedBall === "ground" ? c.groundPositions : c.flyPositions);
  const fielder = fielders.get(position)!;
  const context: DefenseContext = Object.freeze({eventIndex, battedBall, drawnOutcome: drawn, fielder});
  const p = defenseProbabilities(fielder);
  let action: DefenseAction;
  if (override) action = override(context);
  else {
    const roll = random.next();
    action = hit ? (roll < p.hitPrevention ? "hitPrevented" : "none") :
      roll < p.catchingError ? "catchingError" :
      battedBall === "ground" && roll < p.catchingError + p.throwingError ? "throwingError" : "none";
  }
  if (!["none", "hitPrevented", "catchingError", "throwingError"].includes(action) ||
      (hit && action !== "none" && action !== "hitPrevented") ||
      (!hit && action === "hitPrevented") || (battedBall !== "ground" && action === "throwingError"))
    throw new MatchSimulationError("守備注入結果が打球の成立条件に対応していません。");
  const errorKind = action === "catchingError" ? "catching" : action === "throwingError" ? "throwing" : null;
  const outcome = errorKind ? "reachedOnError" : action === "hitPrevented" ? (battedBall === "ground" ? "groundOut" : "flyOut") : drawn;
  return { outcome, event: {...context, hitPrevented: action === "hitPrevented", error: errorKind !== null, errorKind, errorPlayerId: errorKind ? fielder.id : null} };
}
