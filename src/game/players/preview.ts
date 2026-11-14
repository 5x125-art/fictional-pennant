import { abilityRank } from "./rank";
import type { Player } from "./types";

/** UI境界のホワイトリスト。世界や非公開辞書・経歴を丸ごと渡さない。 */
export interface PlayerPreview {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly age: number;
  readonly position: string;
  readonly registration: "senior" | "development";
  readonly throws: "R" | "L";
  readonly bats: "R" | "L" | "S";
  readonly currentAbilities: string;
}
const score = (value: number) => `${value}（${abilityRank(value)}）`;
export function playerPreview(player: Player): PlayerPreview {
  return {
    id: player.id,
    teamId: player.teamId,
    name: player.name,
    age: player.age,
    position: player.primaryPosition,
    registration: player.registration,
    throws: player.throws,
    bats: player.bats,
    currentAbilities:
      player.kind === "pitcher"
        ? `球速 ${player.abilities.velocityKmh}km/h / 制球 ${score(player.abilities.control)} / スタミナ ${score(player.abilities.stamina)}`
        : `対右ミート ${score(player.abilities.contactVsRight)} / 対左 ${score(player.abilities.contactVsLeft)} / パワー ${score(player.abilities.power)} / 走力 ${score(player.abilities.speed)}`,
  };
}
