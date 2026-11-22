import type { PitchType } from "../players/types";
import type { PlateAppearanceOutcome } from "./types";
/** 確定ルール。得点環境の調整値とは分離。 */
export const matchRules = {
  regulationInnings: 9,
  maxInnings: 12,
  outsPerHalf: 3,
  batters: 9,
} as const;
/** すべてPhase 3Aの暫定係数。疲労・球場・守備・采配は未反映。 */
export const probabilityConfig = {
  center: 50,
  velocityCenter: 145,
  movementCenter: 3,
  trajectoryCenter: 2.5,
  hit: {
    base: 0.23,
    contact: 0.00065,
    pitchPower: -0.00025,
    pitchMovement: -0.002,
    velocity: -0.0005,
    control: -0.0001,
    sameHand: -0.005,
    min: 0.16,
    max: 0.31,
  },
  walk: {
    base: 0.085,
    control: -0.0005,
    pitchControl: -0.0002,
    min: 0.035,
    max: 0.13,
  },
  hbp: { base: 0.008, control: -0.00005, min: 0.004, max: 0.016 },
  strikeout: {
    base: 0.2,
    contact: -0.0009,
    velocity: 0.0008,
    pitchPower: 0.0003,
    pitchMovement: 0.005,
    sameHand: 0.01,
    min: 0.12,
    max: 0.31,
  },
  homeRun: {
    base: 0.028,
    power: 0.0003,
    trajectory: 0.004,
    pitchPower: -0.0001,
    min: 0.008,
    max: 0.06,
  },
  double: { base: 0.041, power: 0.00012, min: 0.025, max: 0.065 },
  triple: { base: 0.004, speed: 0.00004, min: 0.001, max: 0.008 },
  groundShare: { base: 0.54, trajectory: -0.04, min: 0.4, max: 0.65 },
  /** 球種の変化量の寄与。個人の総合能力・選手評価値ではない。 */
  movementByPitch: {
    fastball: 0.2,
    slider: 1,
    curve: 0.9,
    changeup: 1,
    fork: 1.1,
    sinker: 0.9,
    cutter: 0.8,
  } satisfies Record<PitchType, number>,
} as const;
export const estimatedPitchRanges: Readonly<
  Record<PlateAppearanceOutcome, readonly [number, number]>
> = {
  single: [2, 6],
  double: [2, 6],
  triple: [2, 6],
  homeRun: [1, 6],
  walk: [4, 7],
  hitByPitch: [1, 3],
  strikeout: [3, 7],
  groundOut: [1, 6],
  flyOut: [1, 6],
  groundDoublePlay: [1, 6],
  sacrificeFly: [1, 6],
  sacrificeBunt: [1, 6],
  reachedOnError: [1, 6],
};
/** 異常な注入・極端な乱数列では勝敗を捏造せず例外で中断する安全弁。野球の打席上限ではない。 */
export const simulationLimits = { plateAppearancesPerHalf: 200 } as const;
/** 初期起用で「適性あり」とみなす暫定境界。0は拒否、1以上を許容。 */
export const minimumStartingAptitude = 1;

/** Phase 3B-1暫定：対象ゴロ／フライのうち成立する割合。犠打AIは未実装。 */
export const runnerPlayConfig = { doublePlayGivenGroundOut: 0.35, sacrificeFlyGivenFlyOut: 0.65 } as const;

/** Phase 3B-2暫定。配列の重複が担当位置の重み。投手守備・送球先選択は対象外。 */
export const defenseConfig = {
  groundPositions: ["1B", "2B", "2B", "3B", "SS", "SS"],
  flyPositions: ["C", "1B", "2B", "3B", "SS", "LF", "LF", "CF", "CF", "CF", "RF", "RF"],
  singleGroundShare: 0.55,
  hitPrevention: { base: 0.015, catching: 0.0004, aptitude: 0.00035, min: 0, max: 0.09 },
  catchingError: { base: 0.012, catching: -0.00012, aptitude: -0.00010, min: 0.001, max: 0.045 },
  throwingError: { base: 0.009, throwing: -0.00010, aptitude: -0.00008, min: 0.001, max: 0.035 },
  center: 50,
} as const;

/** Phase 3B-3A暫定。安打阻止・失策とは別の走塁判断／外野送球係数。 */
export const baserunningConfig = {
  center: 50,
  outfieldPositions: ["LF", "CF", "CF", "RF"],
  singleGroundShare: 0.55,
  attempt: { singleToThird: 0.30, singleToHome: 0.52, doubleToHome: 0.48,
    speed: 0.004, arm: -0.001, twoOuts: 0.12, ground: 0.04, min: 0.03, max: 0.92 },
  out: { base: 0.12, speed: -0.0015, arm: 0.002, throwing: 0.0006,
    aptitude: 0.0004, home: 0.035, twoOuts: -0.02, ground: -0.02, min: 0.015, max: 0.45 },
} as const;

/** Phase 3B-3B暫定。将来のチーム盗塁方針はattemptMultiplierへ接続できる。 */
export const stealingConfig = {
  center: 50,
  attemptMultiplier: 1,
  attempt: { second: 0.055, third: 0.018, speed: 0.0004, stealing: 0.0006,
    arm: -0.00012, twoOuts: -0.006, min: 0.002, max: 0.22 },
  success: { base: 0.72, speed: 0.0018, stealing: 0.0022, arm: -0.0015,
    throwing: -0.001, aptitude: -0.0008, third: -0.08, min: 0.20, max: 0.98 },
  interruptedPlateAppearancePitches: 1,
} as const;

/** Phase 3C-1暫定。保存fitnessとは独立した登板中の疲労。 */
export const pitcherFatigueConfig = {
  onsetBasePitches: 45,
  onsetPerStamina: 0.65,
  pitchesToFullFatigue: 60,
  maxFatigue: 100,
  stages: 4,
  maxReduction: {velocityKmh: 4, control: 10, pitchPower: 8, pitchControl: 10},
  minimumVelocityKmh: 1,
} as const;
