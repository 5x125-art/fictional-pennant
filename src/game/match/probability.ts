import type { PitchAbilities } from "../players/types";
import { SeededRandom } from "../random/seededRandom";
import { probabilityConfig as c, runnerPlayConfig } from "./config";
import {
  playOutcomes,
  type MatchBatter,
  type Situation,
  type MatchPitcher,
  type PlateAppearanceOutcome,
} from "./types";
export type OutcomeProbabilities = Readonly<
  Record<PlateAppearanceOutcome, number>
>;
const clamp = (
  v: number,
  bounds: { readonly min: number; readonly max: number },
) => Math.max(bounds.min, Math.min(bounds.max, v));
/** 全数値は1打席あたりの確率。打率・長打率等の総合スコアは生成しない。 */
export function outcomeProbabilities(
  batter: MatchBatter,
  pitcher: MatchPitcher,
  pitch: PitchAbilities,
  situation?: Pick<Situation, "outs" | "bases">,
): OutcomeProbabilities {
  const a = batter.abilities,
    p = pitcher.abilities;
  const contact =
    (pitcher.throws === "R" ? a.contactVsRight : a.contactVsLeft) - c.center;
  const power = a.power - c.center,
    control = p.control - c.center,
    velocity = p.velocityKmh - c.velocityCenter;
  const pitchPower = pitch.power - c.center,
    pitchControl = pitch.control - c.center;
  const movement =
    (pitch.movement - c.movementCenter) * c.movementByPitch[pitch.type];
  const trajectory = a.trajectory - c.trajectoryCenter;
  // 両打ちは相手投手と逆の打席に入る暫定規則。
  const sameHand = batter.bats !== "S" && batter.bats === pitcher.throws;
  const hit = clamp(
    c.hit.base +
      contact * c.hit.contact +
      pitchPower * c.hit.pitchPower +
      movement * c.hit.pitchMovement +
      velocity * c.hit.velocity +
      control * c.hit.control +
      (sameHand ? c.hit.sameHand : 0),
    c.hit,
  );
  const walk = clamp(
    c.walk.base + control * c.walk.control + pitchControl * c.walk.pitchControl,
    c.walk,
  );
  const hitByPitch = clamp(c.hbp.base + control * c.hbp.control, c.hbp);
  const strikeout = clamp(
    c.strikeout.base +
      contact * c.strikeout.contact +
      velocity * c.strikeout.velocity +
      pitchPower * c.strikeout.pitchPower +
      movement * c.strikeout.pitchMovement +
      (sameHand ? c.strikeout.sameHand : 0),
    c.strikeout,
  );
  const homeRun = clamp(
    c.homeRun.base +
      power * c.homeRun.power +
      trajectory * c.homeRun.trajectory +
      pitchPower * c.homeRun.pitchPower,
    c.homeRun,
  );
  const double = clamp(c.double.base + power * c.double.power, c.double);
  const triple = clamp(
    c.triple.base + (a.speed - c.center) * c.triple.speed,
    c.triple,
  );
  const single = hit - homeRun - double - triple;
  const remaining = 1 - hit - walk - hitByPitch - strikeout;
  const groundOut =
    remaining *
    clamp(
      c.groundShare.base + trajectory * c.groundShare.trajectory,
      c.groundShare,
    );
  const dp = situation && situation.outs < 2 && situation.bases[0] !== null
    ? groundOut * runnerPlayConfig.doublePlayGivenGroundOut : 0;
  const sf = situation && situation.outs < 2 && situation.bases[2] !== null
    ? (remaining - groundOut) * runnerPlayConfig.sacrificeFlyGivenFlyOut : 0;
  return {
    groundDoublePlay: dp, sacrificeFly: sf, sacrificeBunt: 0,
    single,
    double,
    triple,
    homeRun,
    walk,
    hitByPitch,
    strikeout,
    groundOut: groundOut - dp,
    flyOut: remaining - groundOut - sf,
  };
}
/** 各打席で所持球種を等確率選択。その球種別の球威・制球・変化量を反映。 */
export function drawPlateAppearance(
  batter: MatchBatter,
  pitcher: MatchPitcher,
  random: SeededRandom,
  situation?: Pick<Situation, "outs" | "bases">,
): PlateAppearanceOutcome {
  const probabilities = outcomeProbabilities(
    batter,
    pitcher,
    random.pick(pitcher.abilities.pitches),
    situation,
  );
  const roll = random.next();
  let cumulative = 0;
  for (const outcome of playOutcomes) {
    cumulative += probabilities[outcome];
    if (roll < cumulative) return outcome;
  }
  return "flyOut"; // 浮動小数点の末尾誤差のみ。
}
