import { aiPitchingConfig as c, matchRules } from "./config";
import { MatchInputError, MatchSimulationError, type AIPitchingAssessment, type AIPitchingCandidateComparison, type AIPitchingStrategy, type MatchPitcher, type PitchingChangeContext, type PitchingChangeDecision } from "./types";

export function validateAIPitchingStrategy(strategy: AIPitchingStrategy) {
  if (!strategy || typeof strategy !== "object" || Array.isArray(strategy) || Object.keys(strategy).some(k=>k!=="aggression") ||
      typeof strategy.aggression !== "number" || !Number.isFinite(strategy.aggression) || strategy.aggression<0 || strategy.aggression>1)
    throw new MatchInputError("継投積極度は0〜1の有限値で指定してください。");
}

/** この場面の候補比較だけに使う寄与。選手の総合能力として保存・公開しない。 */
function ability(p: MatchPitcher) {
  const a=p.abilities,w=c.ability;
  const bounded=(v:number,min:number,max:number)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!bounded(a.control,0,100)||!bounded(a.velocityKmh,1,300)||!bounded(a.stamina,0,100)||!bounded(a.reliefSuitability,0,100)||!bounded(a.starterSuitability,0,100)||
    !a.pitches.length||a.pitches.some(p=>!bounded(p.power,0,100)||!bounded(p.control,0,100)||!bounded(p.movement,0,7)))throw new MatchSimulationError("AI継投の比較能力が不正です。");
  const average=(values:readonly number[])=>values.reduce((sum,v)=>sum+v,0)/values.length;
  const value=a.control*w.control+(a.velocityKmh-w.velocityCenter)*w.velocity+
    average(a.pitches.map(p=>p.power))*w.power+average(a.pitches.map(p=>p.control))*w.pitchControl+
    average(a.pitches.map(p=>p.movement))*w.movement+a.reliefSuitability*w.reliefSuitability;
  if(!Number.isFinite(value))throw new MatchSimulationError("AI継投の比較能力が不正です。");
  return value;
}

/** 将来結果・非公開成長・日時・乱数は使わず、現時点のスナップショットだけで判断する。 */
export function assessAIPitchingChange(context:PitchingChangeContext,strategy:AIPitchingStrategy={aggression:c.defaultAggression}):AIPitchingAssessment {
  validateAIPitchingStrategy(strategy);
  const {before:s,currentFatigue:f,currentStats:stats,currentPitcher:p,availablePitchers:available}=context;
  if(p.id!==context.currentPitcherId || f.pitcherId!==p.id || p.teamId!==context.fieldingTeamId ||
      !Number.isInteger(s.inning)||s.inning<1||s.inning>matchRules.maxInnings||!Number.isInteger(s.outs)||s.outs<0||s.outs>2||
      !Number.isFinite(f.fatigue)||f.fatigue<0||f.fatigue>100||!Number.isSafeInteger(f.pitches)||f.pitches<0||
      new Set(available.map(p=>p.id)).size!==available.length||available.some(p=>p.id===context.currentPitcherId||p.teamId!==context.fieldingTeamId))
    throw new MatchSimulationError("AI継投の現在投手・状況・候補が不正です。");
  const side=s.half==="top"?"home":"away", offense=side==="home"?"away":"home";
  const lead=s.score[side]-s.score[offense],close=Math.abs(lead)<=c.closeMargin,extra=s.inning>matchRules.regulationInnings;
  const bulk=s.inning<=c.earlyInning||Math.abs(lead)>=c.bulkMargin;
  const late=close&&s.inning>=c.lateInning;
  const roleTable=bulk?c.roleFit.bulk:extra?c.roleFit.extra:late?(s.inning>=c.closerInning?c.roleFit.closing:c.roleFit.late):c.roleFit.middle;
  const candidates=available.map((candidate):AIPitchingCandidateComparison=>{
    const a=ability(candidate),roleFit=roleTable[candidate.role];
    const staminaFit=candidate.abilities.stamina*(bulk?c.bulkStamina:c.otherStamina);
    const handedness=context.batter.bats!=="S"&&context.batter.bats===candidate.throws?c.handedness:0;
    return Object.freeze({pitcherId:candidate.id,role:candidate.role,ability:a,roleFit,staminaFit,handedness,total:a+roleFit+staminaFit+handedness});
  }).sort((a,b)=>b.total-a.total || (a.pitcherId<b.pitcherId?-1:a.pitcherId>b.pitcherId?1:0));
  if(candidates.some(p=>!Number.isFinite(p.total)))throw new MatchSimulationError("AI継投の候補評価が不正です。");
  const isStarter=context.currentAppearance.starter;
  const suitability=isStarter?p.abilities.starterSuitability:p.abilities.reliefSuitability;
  const pitchBudget=(isStarter?c.budget.starterBase+p.abilities.stamina*c.budget.starterStamina:c.budget.relief[p.role]+p.abilities.stamina*c.budget.reliefStamina)+(suitability-50)*c.budget.suitability;
  const loss=Math.max(0,ability(p)-ability(f.effectivePitcher));
  const trouble=Math.min(c.pressure.maxTrouble,Math.max(0,stats.hitsAllowed+stats.walks+stats.hitBatters-stats.outs*c.pressure.trafficPerOut)*c.pressure.traffic+stats.runsAllowed*c.pressure.runs);
  const lateUpgrade=late&&candidates.length>0&&["closer","setup"].includes(candidates[0].role)&&candidates[0].role!==p.role&&stats.outs>=c.shortStint.outs&&f.pitches>=c.shortStint.lateMinimumPitches;
  const pressure=f.pitches/pitchBudget*c.pressure.workload+f.fatigue/100*c.pressure.fatigue+loss*c.pressure.abilityLoss+trouble+(lateUpgrade?c.pressure.lateRole:0);
  const reserve=close&&s.inning>=c.reserveExtraInning&&lead===0;
  const scarce=close&&available.length<=Math.ceil((matchRules.maxInnings-s.inning+1)/c.threshold.reserveInningsPerPitcher);
  const threshold=c.threshold.base+(late?c.threshold.closeLate:0)+(close&&s.bases.some(Boolean)?c.threshold.closeRunners:0)+(Math.abs(lead)>=c.bulkMargin?c.threshold.bulk:0)+
    (available.length===1?c.threshold.lastCandidate:0)+(reserve?c.threshold.reserveExtra:0)+(scarce?c.threshold.scarce:0)+(c.defaultAggression-strategy.aggression)*c.threshold.aggression;
  if(![lead,pitchBudget,pressure,threshold].every(Number.isFinite)||pitchBudget<=0)throw new MatchSimulationError("AI継投の負荷・試合状況が不正です。");
  const result=(decision:PitchingChangeDecision,reason:AIPitchingAssessment["reason"]):AIPitchingAssessment=>Object.freeze({decision:Object.freeze(decision),reason,lead,close,extraInnings:extra,aggression:strategy.aggression,pitchBudget,pressure,threshold,candidates:Object.freeze(candidates)});
  if(!available.length)return result({action:"continue"},"noCandidates");
  const earlyExit=isStarter&&s.inning<=c.earlyInning&&f.pitches>=c.earlyExit.minimumPitches&&stats.runsAllowed>=c.earlyExit.runs&&stats.hitsAllowed+stats.walks+stats.hitBatters>=c.earlyExit.traffic;
  const emergency=f.fatigue>=c.emergency.fatigue||f.pitches>=pitchBudget*c.emergency.budgetRatio;
  if(!isStarter&&!emergency&&!earlyExit&&stats.outs<c.shortStint.outs&&f.pitches<c.shortStint.pitches)return result({action:"continue"},"protectShortStint");
  if(!earlyExit&&!emergency&&pressure<threshold)return result({action:"continue"},scarce||reserve?"reserveBullpen":"lowWorkload");
  return result({action:"change",pitcherId:candidates[0].pitcherId},earlyExit?"autoEarlyExit":f.fatigue>=c.fatigueReasonThreshold?"autoFatigue":lateUpgrade?"autoHighLeverage":"autoWorkload");
}

export function chooseAIPitchingChange(context:PitchingChangeContext,strategy?:AIPitchingStrategy):PitchingChangeDecision {
  return assessAIPitchingChange(context,strategy).decision;
}
