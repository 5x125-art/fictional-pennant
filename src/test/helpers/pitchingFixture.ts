import { matchFixture } from "./matchFixture";
import type { MatchInput, MatchTeamInput } from "../../game/match";

/** テストだけで既存1軍の非外国籍救援を3人、当日ベンチへ明示追加する。 */
export function pitchingFixture(seed=3741, away?: string, home?: string): MatchInput {
  const input=matchFixture(seed,away,home);
  const team=(t:MatchTeamInput):MatchTeamInput=>{
    const relievers=input.players.filter(p=>p.kind==="pitcher" && p.teamId===t.teamId && !p.isForeign && p.role!=="starter" &&
      input.roster.byTeam[t.teamId].firstTeamIds.includes(p.id)).slice(0,3);
    if(relievers.length!==3)throw Error("テスト用救援3人が不足しています。");
    return {...t,availablePlayerIds:[...t.availablePlayerIds,...relievers.map(p=>p.id)]};
  };
  return {...input,away:team(input.away),home:team(input.home)};
}
