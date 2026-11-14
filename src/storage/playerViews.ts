import {
  toPublicPlayer,
  type PublicPlayer,
} from "../game/players/publicPlayer";
import { SaveDataError } from "../game/saveErrors";
import { readGameSave } from "./saves";
export interface PublicRoster {
  readonly saveId: string;
  readonly managedTeamId: string;
  readonly players: readonly PublicPlayer[];
}
/** 既に読み込み・移行したv2セーブを読み取るだけ。生成・書き込みはしない。 */
export async function readPublicRoster(saveId: string): Promise<PublicRoster> {
  const save = await readGameSave(saveId);
  return {
    saveId: save.id,
    managedTeamId: save.teamId,
    players: save.world.players.map(toPublicPlayer),
  };
}
export function findPublicPlayer(
  roster: PublicRoster,
  id: string,
): PublicPlayer {
  const player = roster.players.find((player) => player.id === id);
  if (!player)
    throw new SaveDataError("選手が見つかりません。選手一覧へ戻ってください。");
  return player;
}
