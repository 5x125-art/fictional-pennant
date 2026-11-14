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
};
/** 異常な注入・極端な乱数列では勝敗を捏造せず例外で中断する安全弁。野球の打席上限ではない。 */
export const simulationLimits = { plateAppearancesPerHalf: 200 } as const;
/** 初期起用で「適性あり」とみなす暫定境界。0は拒否、1以上を許容。 */
export const minimumStartingAptitude = 1;
