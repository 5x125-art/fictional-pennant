import { expect, it } from "vitest";
import {
  adjudicatePitchingDecisions, simulateMatch, type MatchOptions, type PitchingChangeContext,
} from "../game/match";
import { fixedHalves } from "./helpers/matchFixture";
import { aiPitchingFixture } from "./helpers/aiPitchingFixture";
import { assertMatchAccounting } from "./helpers/matchAssertions";

const input = aiPitchingFixture(87);
const {away, home} = input;
const outs = "strikeout";
const hr = "homeRun";
type Change = (context: PitchingChangeContext) => boolean;
const at = (inning: number, half: "top" | "bottom", count = 0): Change =>
  c => c.before.inning === inning && c.before.half === half && c.before.outs === count;
function game(scripts: Parameters<typeof fixedHalves>[0], change: Change = () => false, options: MatchOptions = {}) {
  const used = new Set<string>();
  const result = simulateMatch(input, {
    ...options,
    resolvePlateAppearance: fixedHalves(scripts),
    resolvePitchingChange: c => {
      const key = [c.before.inning, c.before.half, c.before.outs, c.eventIndex].join("/");
      if (!used.has(key) && change(c)) {
        used.add(key);
        return {action: "change", pitcherId: c.availablePitchers[0].id};
      }
      return {action: "continue"};
    },
  });
  assertMatchAccounting(result);
  return result;
}

it("15アウトで先発の勝利、12アウトでは救援の勝利", () => {
  for (const inning of [5, 6]) {
    const r = game({"1-top": [hr]}, at(inning, "bottom"));
    expect(r.pitchingByPlayerId[away.startingPitcherId].outs).toBe((inning - 1) * 3);
    expect(r.pitchingDecision.winPitcherId).toBe(inning === 6
      ? away.startingPitcherId : r.pitchingChanges[0].incomingPitcherId);
    expect(r.pitchingDecision.lossPitcherId).toBe(home.startingPitcherId);
    expect(r.pitchingDecision.judgment).toBeNull();
    expect(r.pitchingDecision.savePitcherId).toBe(inning === 6 ? r.pitchingChanges[0].incomingPitcherId : null);
  }
});

it.each([2, 3])("早期降板後の救援2人の投球回数差が %i アウトの場合", boundary => {
  const r = game({"1-top": [hr, hr, hr, hr], "5-bottom": boundary === 3 ? [hr, hr] : [outs, hr, hr]}, c =>
    c.before.bases.every(base => base === null) && (
      (c.currentStats.starts === 1 && at(5, "bottom", 3 - boundary)(c)) ||
      (c.currentAppearance.entry?.inning === 5 && at(8, "bottom")(c))));
  const [long, short] = r.pitchingChanges.map(c => c.incomingPitcherId);
  expect(r.pitchingByPlayerId[long].outs - r.pitchingByPlayerId[short].outs).toBe(boundary);
  expect(r.pitchingDecision).toMatchObject(boundary === 3 ? {
    status: "adjudicated", reason: "reliefOutsAdvantage", winPitcherId: long, judgment: null,
  } : {
    status: "provisional", winPitcherId: short,
    judgment: {reason: "shortStarter", candidates: [{pitcherId: short, outs: 6}, {pitcherId: long, outs: 8}]},
  });
});

it("同点で先発の勝利権利を取り消し、再逆転の救援に勝敗を裁定", () => {
  const r = game({"1-top": [hr], "6-bottom": [hr, hr], "7-top": [hr, hr]},
    c => c.currentStats.starts === 1 && (at(6, "bottom")(c) || at(7, "top")(c)));
  const [awayRelief, homeRelief] = r.pitchingChanges.map(c => c.incomingPitcherId);
  expect(r.pitchingDecision).toMatchObject({
    winPitcherId: awayRelief, lossPitcherId: homeRelief, holdPitcherIds: [],
  });
  expect(r.pitchingDecision.decisiveRun?.runner.playerId).toBe(r.events.find(e =>
    e.before.inning === 7 && e.before.half === "top" && e.after.score.away === 3)?.batterId);
});

it.each([2, 3])("失点した救援の投球回数が %i アウトの場合の勝利裁定", recordedOuts => {
  const r = game({"7-top": [hr, hr], "7-bottom": [hr]}, c =>
    (at(6, "bottom", 4 - recordedOuts)(c) && c.currentStats.starts === 1) ||
    (at(7, "bottom", 1)(c) && c.currentStats.runsAllowed === 1));
  const [first, later] = r.pitchingChanges.map(c => c.incomingPitcherId);
  expect(r.pitchingByPlayerId[first].outs).toBe(recordedOuts);
  expect(r.pitchingDecision).toMatchObject(recordedOuts < 3 ? {
    status: "provisional", winPitcherId: later,
    judgment: {reason: "briefIneffectiveRelief"},
  } : {status: "adjudicated", winPitcherId: first, judgment: null});
});

it.each([9, 10, 11, 12])("%i回のサヨナラで二人目の生還が決勝点となり、降板した責任投手が敗戦", inning => {
  const r = game({
    "1-top": [hr], "1-bottom": inning > 9 ? [hr] : [],
    [`${inning}-bottom`]: inning > 9 ? ["walk", hr] : ["walk", "walk", hr],
  }, c => c.before.inning === inning && c.before.half === "bottom" &&
    c.before.bases.filter(Boolean).length === (inning === 9 ? 2 : 1) && c.currentStats.starts === 1);
  const event = r.events.at(-1)!;
  const runIndex = inning === 9 ? 1 : 0;
  expect(r.endReason).toBe("walkOff");
  expect(r.pitchingDecision).toMatchObject({
    winPitcherId: home.startingPitcherId, lossPitcherId: away.startingPitcherId,
    decisiveRun: {eventIndex: event.index, runIndex, runner: event.scoredRuns[runIndex]},
  });
  expect(event.pitcherId).not.toBe(r.pitchingDecision.lossPitcherId);
});

it.each([
  {margin: 3, inning: 9, runners: 0, expected: true},
  {margin: 4, inning: 9, runners: 0, expected: false},
  {margin: 4, inning: 9, runners: 2, expected: true},
  {margin: 5, inning: 9, runners: 2, expected: false},
  {margin: 6, inning: 7, runners: 0, expected: true},
])("セーブ条件 $margin 点差・$inning 回・走者 $runners 人", ({margin, inning, runners, expected}) => {
  const r = game({
    "1-bottom": Array(margin).fill(hr),
    [`${inning}-top`]: [...Array(runners).fill("walk"), outs, outs],
  }, c => c.before.inning === inning && c.before.half === "top" && c.currentStats.starts === 1 &&
    c.before.bases.filter(Boolean).length === runners && c.before.outs === (runners ? 2 : 0));
  const id = r.pitchingChanges[0].incomingPitcherId;
  expect(r.pitchingDecision.savePitcherId).toBe(expected ? id : null);
  expect(r.innings.at(-1)?.home).toBeNull();
});

it("リードでの登板・降板、0アウトの降板、引き分け時の最終投手を区別", () => {
  const lead = game({"1-bottom": [hr]}, c => at(7, "top")(c) || at(9, "top")(c));
  expect(lead.pitchingDecision.holdPitcherIds).toEqual([lead.pitchingChanges[0].incomingPitcherId]);
  expect(lead.pitchingDecision.savePitcherId).toBe(lead.pitchingChanges[1].incomingPitcherId);
  const zero = game({"1-bottom": [hr], "7-top": ["walk"]}, c =>
    at(7, "top")(c) && (c.currentStats.starts === 1 || c.before.bases.some(Boolean)));
  expect(zero.pitchingByPlayerId[zero.pitchingChanges[0].incomingPitcherId].outs).toBe(0);
  expect(zero.pitchingDecision.holdPitcherIds).toEqual([]);
  const draw = game({}, c => at(9, "top")(c) || at(10, "bottom")(c) || at(11, "top")(c));
  expect(draw.pitchingDecision).toMatchObject({
    status: "draw", winPitcherId: null, lossPitcherId: null, savePitcherId: null,
    holdPitcherIds: [draw.pitchingChanges[0].incomingPitcherId],
  });
});

it.each([1, 2])("降板後の責任走者の生還とホールド（%i点リード）", margin => {
  const r = game({"1-bottom": Array(margin).fill(hr), "7-top": [outs, "triple", "single"],
    "8-bottom": [hr]}, c => at(7, "top")(c) && c.currentStats.starts === 1 ||
    at(7, "top", 1)(c) && c.before.bases[2] !== null);
  const id = r.pitchingChanges[0].incomingPitcherId;
  expect(r.pitchingByPlayerId[id]).toMatchObject({runsAllowed: 1, holds: Number(margin > 1)});
  expect(r.events.find(e => e.scoredRuns.some(run => run.responsiblePitcherId === id))?.pitcherId).not.toBe(id);
});

it("盗塁死第3アウトだけでもホールドに必要なアウトを満たす", () => {
  const r = game({"1-bottom": [hr], "7-top": ["walk", outs, outs]}, c =>
    at(7, "top", 2)(c) || at(8, "top")(c), {
      resolveStealing: c => c.before.inning === 7 && c.before.half === "top" && c.before.outs === 2
        ? {action: "out", runnerId: c.candidates[0].id} : {action: "hold"},
    });
  const id = r.pitchingChanges[0].incomingPitcherId;
  expect(r.pitchingByPlayerId[id]).toMatchObject({outs: 1, pitches: 1, holds: 1});
});

it("裁定は純粋で再実行可能で、得点イベントが欠けた場合は未裁定", () => {
  const r = game({"1-top": [hr]}, at(6, "bottom"));
  const before = JSON.stringify(r);
  expect(adjudicatePitchingDecisions(r)).toEqual(r.pitchingDecision);
  expect(JSON.stringify(r)).toBe(before);
  expect(adjudicatePitchingDecisions({...r, timeline: []})).toMatchObject({
    status: "unadjudicated", reason: "missingScoringTimeline",
    winPitcherId: null, lossPitcherId: null, savePitcherId: null, holdPitcherIds: [],
  });
});

it("同点で無失点降板した救援だけにホールドを付け、決着試合の最終投手を除外", () => {
  const r = game({"9-bottom": [hr]}, c =>
    c.currentStats.starts === 1 && (at(7, "top")(c) || at(9, "bottom")(c)) ||
    at(8, "top")(c));
  expect(r.pitchingDecision.holdPitcherIds).toEqual([r.pitchingChanges[0].incomingPitcherId]);
  expect(r.pitchingDecision.winPitcherId).toBe(r.pitchingChanges[1].incomingPitcherId);
  expect(r.pitchingDecision.lossPitcherId).toBe(r.pitchingChanges[2].incomingPitcherId);
});

it("同点登板の救援が残した走者の生還で負けた場合は敗戦のみ", () => {
  const r = game({"7-top": [outs, "triple", "single"]}, c =>
    at(7, "top")(c) && c.currentStats.starts === 1 || at(7, "top", 1)(c) && c.before.bases[2] !== null);
  const id = r.pitchingChanges[0].incomingPitcherId;
  expect(r.pitchingDecision.lossPitcherId).toBe(id);
  expect(r.pitchingByPlayerId[id]).toMatchObject({outs: 1, runsAllowed: 1, losses: 1, holds: 0});
});

it("リードを失った救援には、味方が登板中に再勝ち越ししてもホールドを付けない", () => {
  const r = game({"1-bottom": [hr], "7-top": [hr], "7-bottom": [hr],
    "8-top": [hr, hr], "9-bottom": [hr, hr]}, c =>
    c.currentStats.starts === 1 && at(7, "top")(c) ||
    at(8, "top")(c) && c.currentAppearance.entry?.inning === 7);
  expect(r.pitchingChanges[1].before.score).toEqual({away: 1, home: 2});
  expect(r.pitchingDecision.winPitcherId).toBe(r.pitchingChanges[1].incomingPitcherId);
  expect(r.pitchingDecision.holdPitcherIds).toEqual([]);
});

it("登板中に前任者の走者が生還した短い救援は、責任失点0でも暫定裁定の対象になる", () => {
  const r = game({"6-bottom": [outs, outs, "triple", "single"],
    "7-top": [hr, hr]}, c =>
    (at(6, "bottom", 2)(c) && c.before.bases[2] !== null) || at(7, "bottom")(c));
  const [first, later] = r.pitchingChanges.map(c => c.incomingPitcherId);
  expect(r.pitchingByPlayerId[first]).toMatchObject({outs: 1, runsAllowed: 0});
  expect(r.pitchingByPlayerId[away.startingPitcherId].runsAllowed).toBe(1);
  expect(r.pitchingDecision).toMatchObject({
    status: "provisional", winPitcherId: later,
    judgment: {reason: "briefIneffectiveRelief", candidates: [
      {pitcherId: first, runsWhilePitching: 1, runsAllowed: 0}, {pitcherId: later, runsWhilePitching: 0},
    ]},
  });
});

it.each([
  {beforeLead: false, inheritedTie: false, holds: 1},
  {beforeLead: false, inheritedTie: true, holds: 0},
  {beforeLead: true, inheritedTie: false, holds: 0},
])("同点登板後の失点順と降板後の生還でホールドを判定する %j", ({beforeLead, inheritedTie, holds}) => {
  const r = game({
    "7-top": beforeLead ? [hr] : [],
    "7-bottom": [hr, hr],
    "8-top": inheritedTie ? [hr, outs, "triple", "single"] : beforeLead ? [] : [hr],
    "9-top": inheritedTie ? [] : [hr],
  }, c => (at(7, "top")(c) && c.currentStats.starts === 1) ||
    (inheritedTie ? at(8, "top", 1)(c) && c.before.bases[2] !== null && c.currentAppearance.entry?.inning === 7
      : at(9, "top")(c) && c.currentAppearance.entry?.inning === 7));
  const id = r.pitchingChanges[0].incomingPitcherId;
  expect(r.pitchingChanges[0].before.score).toEqual({away: 0, home: 0});
  expect(r.pitchingChanges[1].before.score).toEqual({away: 1, home: 2});
  expect(r.pitchingDecision.status).toBe("draw");
  expect(r.pitchingByPlayerId[id]).toMatchObject({runsAllowed: inheritedTie ? 2 : 1, holds});
});
