import { pitcherFatigueConfig as c } from "./config";
import { MatchSimulationError, type MatchPitcher, type PitcherFatigueAdjustments, type PitcherFatigueLevel, type PitcherFatigueState } from "./types";

/** 球数と保存スタミナだけから計算する。乱数・fitness・所属状態は参照しない。 */
export function pitcherFatigue(stamina: number, pitches: number): PitcherFatigueLevel {
  if (!Number.isInteger(stamina) || stamina < 0 || stamina > 100 || !Number.isSafeInteger(pitches) || pitches < 0)
    throw new MatchSimulationError("疲労計算のスタミナ・球数が不正です。");
  const onsetPitches = c.onsetBasePitches + stamina*c.onsetPerStamina;
  const fatigue = Math.min(c.maxFatigue, Math.max(0, (pitches-onsetPitches)/c.pitchesToFullFatigue*c.maxFatigue));
  return Object.freeze({stamina, pitches, onsetPitches, fatigue, stage: fatigueStage(fatigue)});
}

function fatigueStage(fatigue: number) {
  if (typeof fatigue !== "number" || !Number.isFinite(fatigue) || fatigue < 0 || fatigue > c.maxFatigue)
    throw new MatchSimulationError("疲労度は0〜100の有限値で指定してください。");
  return Math.ceil(fatigue/c.maxFatigue*c.stages);
}

function fatigueAdjustments(fatigue: number): PitcherFatigueAdjustments {
  const scale = fatigueStage(fatigue)/c.stages;
  return Object.freeze({velocityKmh:c.maxReduction.velocityKmh*scale, control:c.maxReduction.control*scale,
    pitchPower:c.maxReduction.pitchPower*scale, pitchControl:c.maxReduction.pitchControl*scale});
}

/** 固定疲労0／100の確率比較にも使える純粋関数。常に基礎能力から作る。 */
export function applyPitcherFatigue(base: MatchPitcher, fatigue: number): MatchPitcher {
  const reduction = fatigueAdjustments(fatigue), a = base.abilities;
  const ability = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
  if (!ability(a.velocityKmh,1,300) || !ability(a.control,0,100) || !ability(a.stamina,0,100) ||
      !a.pitches.length || a.pitches.some(p => !ability(p.power,0,100) || !ability(p.control,0,100) || !Number.isInteger(p.movement) || !ability(p.movement,0,7)))
    throw new MatchSimulationError("疲労適用前の投球能力が不正です。");
  // 未知フィールドや非公開成長情報をコピーしない。上限は入力検証済みの基礎能力。
  return Object.freeze({id:base.id, teamId:base.teamId, throws:base.throws, abilities:Object.freeze({
    velocityKmh:Math.max(c.minimumVelocityKmh,a.velocityKmh-reduction.velocityKmh),
    control:Math.max(0,a.control-reduction.control), stamina:a.stamina,
    starterSuitability:a.starterSuitability, reliefSuitability:a.reliefSuitability,
    pitches:Object.freeze(a.pitches.map(p => Object.freeze({type:p.type,power:Math.max(0,p.power-reduction.pitchPower),
      control:Math.max(0,p.control-reduction.pitchControl),movement:p.movement}))),
  })});
}

export function pitcherFatigueState(base: MatchPitcher, pitches: number): PitcherFatigueState {
  const level = pitcherFatigue(base.abilities.stamina,pitches);
  return Object.freeze({...level,pitcherId:base.id,adjustments:fatigueAdjustments(level.fatigue),effectivePitcher:applyPitcherFatigue(base,level.fatigue)});
}
