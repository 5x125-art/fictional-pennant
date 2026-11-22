import { advanceOnHit } from "./baserunning";
import { advanceRunners, type PlayTransition } from "./runners";
import { MatchSimulationError, type RunnerResponsibility, type Bases, type PlateAppearanceOutcome } from "./types";

/** 失策なし仮想イニングと実得点の打席トークンを照合する暫定判定。正式記録員の裁定ではない。 */
export class EarnedRunReconstruction {
  private bases: Bases = [null, null, null];
  private outs = 0;
  private readonly shadowScored = new Set<string>();
  private readonly actualScored = new Set<string>();
  private readonly actualRunners = new Map<string, string>();

  private readonly responsible = new Map<string, RunnerResponsibility>();

  get activeResponsibilities(): readonly RunnerResponsibility[] {
    return Object.freeze([...this.actualRunners.values()].map(token => this.responsible.get(token)!));
  }

  record(token: string, batterId: string, play: PlayTransition, errorFreeOutcome: PlateAppearanceOutcome, pitcherId: string): readonly RunnerResponsibility[] {
    // 選手IDではなく打席ごとのトークンを使い、打者一巡後の別出塁を区別する。
    if (play.movements.some(m => m.playerId === batterId && m.to !== "out")) {
      if (!pitcherId || this.responsible.has(token)) throw new MatchSimulationError("責任投手・出塁トークンが不正です。");
      this.actualRunners.set(batterId, token);
      this.responsible.set(token,Object.freeze({token,playerId:batterId,responsiblePitcherId:pitcherId}));
    }
    const runnerTokens = new Map(this.actualRunners);
    const scored = play.scoredPlayerIds.map(id => {
      const token = this.actualRunners.get(id), responsibility = token && this.responsible.get(token);
      if (!responsibility) throw new MatchSimulationError("得点走者の責任投手が存在しません。");
      this.actualScored.add(token!);
      return responsibility;
    });
    for (const movement of play.movements)
      if (movement.to === "out" || movement.to === "score") this.actualRunners.delete(movement.playerId);
    if (this.outs >= 3) return Object.freeze(scored);
    let outcome = errorFreeOutcome;
    if (outcome === "groundDoublePlay" && (this.outs >= 2 || !this.bases[0])) outcome = "groundOut";
    if (outcome === "sacrificeFly" && (this.outs >= 2 || !this.bases[2])) outcome = "flyOut";
    if (outcome === "sacrificeBunt" && (this.outs >= 2 || this.bases[2] || !this.bases.some(Boolean))) outcome = "groundOut";
    const replay = new Map(play.movements.filter(m => m.extraAdvance).map(m => [runnerTokens.get(m.playerId), m.extraAdvance!]));
    const shadow = outcome === "single" || outcome === "double"
      ? advanceOnHit(this.bases, token, outcome, this.outs, undefined, (runnerToken, from, target) => {
          const extra = replay.get(runnerToken);
          // 失策なし状態でも同じ出発塁・目標で成立するときだけ、乱数を再抽選せず再適用。
          return extra?.from === from && extra.target === target ? extra : undefined;
        })
      : advanceRunners(this.bases, token, outcome, undefined, this.outs);
    this.bases = shadow.bases;
    this.outs += shadow.outsRecorded;
    for (const id of shadow.scoredPlayerIds) this.shadowScored.add(id);
    return Object.freeze(scored);
  }
  /** 実走者→出塁トークンを使う。仮想塁に存在しない走者を生成しない。 */
  recordStealing(runnerId: string, from: 1 | 2, to: 2 | 3, action: "safe" | "out") {
    const token = this.actualRunners.get(runnerId);
    if (action === "out") this.actualRunners.delete(runnerId);
    if (this.outs >= 3 || !token || this.bases[from-1] !== token || this.bases[to-1] !== null) return;
    const next: [string | null, string | null, string | null] = [...this.bases];
    next[from-1] = null;
    if (action === "safe") next[to-1] = token;
    else this.outs++;
    this.bases = next;
  }
  get earnedRunsByPitcherId(): Readonly<Record<string,number>> {
    const result: Record<string,number> = Object.create(null);
    for (const token of this.actualScored) if (this.shadowScored.has(token)) {
      const pitcherId = this.responsible.get(token)!.responsiblePitcherId;
      result[pitcherId] = (result[pitcherId] ?? 0)+1;
    }
    return Object.freeze(result);
  }
  get earnedRuns() {
    return [...this.actualScored].filter(id => this.shadowScored.has(id)).length;
  }
}
