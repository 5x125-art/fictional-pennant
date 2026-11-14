import { expect, it } from "vitest";
import { simulateMatch } from "../game/match/simulate";
import { validateMatchInput } from "../game/match/validate";
import { MatchInputError } from "../game/match/types";
import { matchFixture } from "./helpers/matchFixture";
// unknown入力を意図的に壊すためのテスト用型。
type Unsafe = any;
const cases: readonly [string, (input: Unsafe) => void][] = [
  [
    "同じ球団",
    (x) => {
      x.home = x.away;
    },
  ],
  [
    "9人未満",
    (x) => {
      x.away.battingOrder.pop();
    },
  ],
  [
    "9人超",
    (x) => {
      x.away.battingOrder.push(x.away.battingOrder[0]);
    },
  ],
  [
    "打順重複",
    (x) => {
      x.away.battingOrder[8] = x.away.battingOrder[0];
    },
  ],
  [
    "守備重複",
    (x) => {
      x.away.battingOrder[0].position = x.away.battingOrder[1].position;
    },
  ],
  [
    "投手をDHに指定",
    (x) => {
      x.away.battingOrder[8].playerId = x.away.startingPitcherId;
    },
  ],
  [
    "野手を先発投手に指定",
    (x) => {
      x.away.startingPitcherId = x.away.battingOrder[8].playerId;
    },
  ],
  [
    "他球団選手",
    (x) => {
      x.away.battingOrder[0].playerId = x.home.battingOrder[0].playerId;
    },
  ],
  [
    "不明選手",
    (x) => {
      x.away.battingOrder[0].playerId = "missing";
    },
  ],
  [
    "2軍所属",
    (x) => {
      const id = x.away.battingOrder[0].playerId;
      x.roster.byTeam[x.away.teamId].firstTeamIds = x.roster.byTeam[
        x.away.teamId
      ].firstTeamIds.filter((p: string) => p !== id);
    },
  ],
  [
    "育成選手",
    (x) => {
      const p = x.players.find(
        (p: Unsafe) => p.id === x.away.battingOrder[0].playerId,
      );
      p.registration = "development";
    },
  ],
  [
    "適性0",
    (x) => {
      const p = x.players.find(
        (p: Unsafe) => p.id === x.away.battingOrder[0].playerId,
      );
      p.positionAptitudes.C = 0;
    },
  ],
  [
    "P守備位置を野手に指定",
    (x) => {
      x.away.battingOrder[0].position = "P";
    },
  ],
  [
    "不明守備位置",
    (x) => {
      x.away.battingOrder[0].position = "XX";
    },
  ],
  [
    "DH欠員",
    (x) => {
      x.away.battingOrder[8].position = "RF";
    },
  ],
  [
    "ベンチから打者を除外",
    (x) => {
      x.away.availablePlayerIds = x.away.availablePlayerIds.slice(1);
    },
  ],
  [
    "ベンチから投手を除外",
    (x) => {
      x.away.availablePlayerIds = x.away.availablePlayerIds.filter(
        (id: string) => id !== x.away.startingPitcherId,
      );
    },
  ],
  [
    "ベンチID重複",
    (x) => {
      x.away.availablePlayerIds.push(x.away.availablePlayerIds[0]);
    },
  ],
  [
    "選手ID重複",
    (x) => {
      x.players.push(x.players[0]);
    },
  ],
  [
    "不正球団",
    (x) => {
      x.away.teamId = "unknown";
    },
  ],
  [
    "非有限能力",
    (x) => {
      x.players[0].abilities.power = NaN;
    },
  ],
  [
    "能力100超",
    (x) => {
      x.players[0].abilities.contactVsRight = 101;
    },
  ],
  [
    "弾道0",
    (x) => {
      x.players[0].abilities.trajectory = 0;
    },
  ],
  [
    "所持球種なし",
    (x) => {
      x.players.find((p: Unsafe) => p.kind === "pitcher").abilities.pitches =
        [];
    },
  ],
  [
    "不明球種",
    (x) => {
      x.players.find(
        (p: Unsafe) => p.kind === "pitcher",
      ).abilities.pitches[0].type = "magic";
    },
  ],
  [
    "球種重複",
    (x) => {
      const p = x.players.find((p: Unsafe) => p.kind === "pitcher");
      p.abilities.pitches.push(p.abilities.pitches[0]);
    },
  ],
  [
    "球速0",
    (x) => {
      x.players.find(
        (p: Unsafe) => p.kind === "pitcher",
      ).abilities.velocityKmh = 0;
    },
  ],
  [
    "不正所属状態",
    (x) => {
      x.roster.currentDay = -1;
    },
  ],
  [
    "シード小数",
    (x) => {
      x.seed = 1.5;
    },
  ],
  [
    "シード範囲外",
    (x) => {
      x.seed = 0x100000000;
    },
  ],
  [
    "シード負数",
    (x) => {
      x.seed = -1;
    },
  ],
  [
    "シードNaN",
    (x) => {
      x.seed = NaN;
    },
  ],
];
it.each(cases)("%sを拒否し元データを変更しない", (_name, breakInput) => {
  const input = structuredClone(matchFixture()) as Unsafe;
  breakInput(input);
  const before = structuredClone(input);
  expect(() => validateMatchInput(input)).toThrow(MatchInputError);
  expect(() => simulateMatch(input)).toThrow(MatchInputError);
  expect(input).toEqual(before);
});
it.each([null, {}, [], { players: [] }, { seed: 0, players: [null] }])(
  "未整備の試合入力を同期的に拒否する: %j",
  (input) => expect(() => validateMatchInput(input)).toThrow(MatchInputError),
);
it("登録済み選手から明示した両リーグ共通DHスタメンを受け付ける", () =>
  expect(() => validateMatchInput(matchFixture())).not.toThrow());
