import { advanceRunners, type PlayTransition } from "./runners";
import type { Bases, PlateAppearanceOutcome } from "./types";

/** 失策なし仮想イニングと実得点の打席トークンを照合する暫定判定。正式記録員の裁定ではない。 */
export class EarnedRunReconstruction {
  private bases: Bases = [null, null, null];
  private outs = 0;
  private readonly shadowScored = new Set<string>();
  private readonly actualScored = new Set<string>();
  private readonly actualRunners = new Map<string, string>();

  record(token: string, batterId: string, play: PlayTransition, errorFreeOutcome: PlateAppearanceOutcome) {
    // 選手IDではなく打席ごとのトークンを使い、打者一巡後の別出塁を区別する。
    this.actualRunners.set(batterId, token);
    for (const id of play.scoredPlayerIds) this.actualScored.add(this.actualRunners.get(id)!);
    for (const movement of play.movements)
      if (movement.to === "out" || movement.to === "score") this.actualRunners.delete(movement.playerId);
    if (this.outs >= 3) return;
    let outcome = errorFreeOutcome;
    if (outcome === "groundDoublePlay" && (this.outs >= 2 || !this.bases[0])) outcome = "groundOut";
    if (outcome === "sacrificeFly" && (this.outs >= 2 || !this.bases[2])) outcome = "flyOut";
    if (outcome === "sacrificeBunt" && (this.outs >= 2 || this.bases[2] || !this.bases.some(Boolean))) outcome = "groundOut";
    const shadow = advanceRunners(this.bases, token, outcome, undefined, this.outs);
    this.bases = shadow.bases;
    this.outs += shadow.outsRecorded;
    for (const id of shadow.scoredPlayerIds) this.shadowScored.add(id);
  }
  get earnedRuns() {
    return [...this.actualScored].filter(id => this.shadowScored.has(id)).length;
  }
}
