import { rankThresholds } from "./generationConfig";
export type AbilityRank = (typeof rankThresholds)[number]["rank"];
/** 0〜100の整数能力専用。球速・弾道・変化量には使用しない。 */
export function abilityRank(value: number): AbilityRank {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new RangeError("能力値は0〜100の整数で指定してください。");
  return rankThresholds.find((threshold) => value >= threshold.min)!.rank;
}
