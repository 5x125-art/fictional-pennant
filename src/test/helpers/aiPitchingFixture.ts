import { matchFixture, fixtureTeam } from "./matchFixture";
import { deregisterFirstTeam, registerFirstTeam, isFirstTeam } from "../../game/roster/roster";
import type { MatchInput } from "../../game/match";

/** 既存の能力・役割は変えず、テスト用1軍を既存の登録APIで役割均衡化する。保存はしない。 */
const prepared=(()=>{
  const source=matchFixture(),index=new Map(source.players.map(p=>[p.id,p]));
  let roster=source.roster;
  const bullpen=new Map<string,readonly string[]>();
  for(const teamId of Object.keys(roster.byTeam)){
    const first=fixtureTeam(teamId),selected:string[]=[];
    for(const [role,count] of [["middle",3],["long",2],["setup",2],["closer",1],["starter",1]] as const){
      const choices=source.players.filter(p=>p.kind==="pitcher"&&p.teamId===teamId&&p.registration==="senior"&&!p.isForeign&&p.id!==first.startingPitcherId&&p.role===role).slice(0,count);
      if(choices.length!==count)throw Error("役割別の既存投手が不足しています。");
      selected.push(...choices.map(p=>p.id));
    }
    const keep=new Set([...selected,first.startingPitcherId]);
    for(const id of roster.byTeam[teamId].firstTeamIds){
      if(index.get(id)!.kind!=="pitcher"||keep.has(id))continue;
      const result=deregisterFirstTeam(source.players,roster,teamId,id);if(!result.ok)throw Error(result.reasons.join(" "));roster=result.state;
    }
    for(const id of selected)if(!isFirstTeam(roster,teamId,id)){
      const result=registerFirstTeam(source.players,roster,teamId,id);if(!result.ok)throw Error(result.reasons.join(" "));roster=result.state;
    }
    bullpen.set(teamId,Object.freeze(selected));
  }
  return {roster,bullpen};
})();

export function aiPitchingFixture(seed=3741,away?:string,home?:string):MatchInput {
  const input=matchFixture(seed,away,home);
  return {...input,roster:prepared.roster,
    away:{...input.away,availablePlayerIds:[...input.away.availablePlayerIds,...prepared.bullpen.get(input.away.teamId)!]},
    home:{...input.home,availablePlayerIds:[...input.home.availablePlayerIds,...prepared.bullpen.get(input.home.teamId)!]}};
}
