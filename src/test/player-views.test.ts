import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { generateInitialPlayerWorld } from "../game/players/generate";
import { toPublicPlayer } from "../game/players/publicPlayer";
import {
  battingAverage,
  earnedRunAverage,
  inningsPitched,
  relativeSeason,
} from "../game/players/statistics";
import { findPublicPlayer } from "../storage/playerViews";
import { AbilityValue } from "../components/players/AbilityValue";
import { PlayerDetail } from "../components/players/PlayerDetail";
import { PlayerStats } from "../components/players/PlayerStats";
const world = generateInitialPlayerWorld(20261114);

describe("公開選手DTO", () => {
  it("全12球団・912人の現在能力と基礎成績を、非公開情報なしで保持する", () => {
    const players = world.players.map(toPublicPlayer);
    expect(players).toHaveLength(912);
    for (const teamId of new Set(players.map((player) => player.teamId)))
      expect(players.filter((player) => player.teamId === teamId)).toHaveLength(
        76,
      );
    players.forEach((player, index) => {
      const source = world.players[index];
      expect(player.id).toBe(source.id);
      expect(player.name).toBe(source.name);
      expect(player.abilities).toEqual(source.abilities);
      expect(player.history).toEqual(source.history);
      expect(player.contract).toEqual(source.contract);
      expect(player.abilities).not.toBe(source.abilities);
      expect(player.history).not.toBe(source.history);
    });
    expect(JSON.stringify(players)).not.toMatch(
      /developmentByPlayerId|growthType|abilityCaps|completedJapanSeasons/,
    );
  });
  it("元データに非公開フィールドが紛れ込んでも、ネストも含めて取り除く", () => {
    for (const kind of ["fielder", "pitcher"] as const) {
      const player = structuredClone(
        world.players.find(
          (player) => player.kind === kind && player.history.length > 0,
        )!,
      );
      Object.assign(player, { growthType: "late", developmentByPlayerId: {} });
      for (const value of [
        player.abilities,
        player.contract,
        player.career,
        player.history[0],
        player.history[0].firstTeam,
      ])
        Object.assign(value, {
          abilityCaps: { secret: 99 },
          growthType: "late",
        });
      if (player.kind === "fielder")
        Object.assign(player.positionAptitudes, { growthType: "late" });
      else
        Object.assign(player.abilities.pitches[0], {
          growthType: "late",
          abilityCaps: { secret: 99 },
        });
      expect(JSON.stringify(toPublicPlayer(player))).not.toMatch(
        /growthType|abilityCaps|developmentByPlayerId|secret/,
      );
    }
  });
  it("存在しないIDを拒否し、詳細にも一覧へ戻る案内を用意する", () => {
    const roster = {
      saveId: "test",
      managedTeamId: "sapporo",
      players: world.players.map(toPublicPlayer),
    };
    expect(findPublicPlayer(roster, roster.players[0].id)).toBe(
      roster.players[0],
    );
    expect(() => findPublicPlayer(roster, "missing")).toThrow(
      "選手が見つかりません",
    );
    const html = renderToStaticMarkup(
      createElement(PlayerDetail, { player: undefined, onBack: () => {} }),
    );
    expect(html).toContain("選手が見つかりません");
    expect(html).toContain("選手一覧に戻る");
  });
});

describe("基礎成績の計算・表記", () => {
  it.each([
    [1, 3, ".333"],
    [1, 6, ".167"],
    [0, 4, ".000"],
    [4, 4, "1.000"],
    [0, 0, "—"],
  ] as const)("打率 %i/%i は %s", (hits, atBats, expected) =>
    expect(battingAverage(hits, atBats)).toBe(expected),
  );
  it.each([
    [1, 27, "1.00"],
    [2, 18, "3.00"],
    [1, 4, "6.75"],
    [0, 3, "0.00"],
    [0, 0, "—"],
    [2, 0, "—"],
  ] as const)("防御率 自責点%i/アウト%i は %s", (runs, outs, expected) =>
    expect(earnedRunAverage(runs, outs)).toBe(expected),
  );
  it.each([
    [0, "0.0"],
    [1, "0.1"],
    [2, "0.2"],
    [3, "1.0"],
    [4, "1.1"],
    [5, "1.2"],
    [29, "9.2"],
  ] as const)("%iアウトの投球回は%s", (outs, expected) =>
    expect(inningsPitched(outs)).toBe(expected),
  );
  it("相対シーズンだけを表示し、不正な基礎値を拒否する", () => {
    expect(relativeSeason(-1)).toBe("1シーズン前");
    expect(relativeSeason(-12)).toBe("12シーズン前");
    expect(relativeSeason(0)).toBe("相対シーズン 0");
    expect(() => battingAverage(2, 1)).toThrow();
    expect(() => earnedRunAverage(-1, 3)).toThrow();
    expect(() => inningsPitched(1.5)).toThrow();
    expect(() => inningsPitched(NaN)).toThrow();
  });
  it.each([
    [90, "S"],
    [80, "A"],
    [70, "B"],
    [60, "C"],
    [50, "D"],
    [40, "E"],
    [30, "F"],
    [0, "G"],
  ] as const)("能力%iは数値と%sランクを併記する", (value, rank) => {
    const html = renderToStaticMarkup(createElement(AbilityValue, { value }));
    expect(html).toContain(`<strong>${value}</strong>`);
    expect(html).toContain(`data-rank="${rank}"`);
    expect(html).toContain(`${rank}ランク`);
  });
  it("保存済み過去成績のない選手に今季成績を捏造しない", () => {
    const player = { ...toPublicPlayer(world.players[0]), history: [] };
    const html = renderToStaticMarkup(createElement(PlayerStats, { player }));
    expect(html).toContain("保存済みの過去成績はありません");
    expect(html).toContain("試合処理は未実装");
    expect(html).toContain("今季成績はありません");
    expect(html).not.toContain("season-record");
  });
});
