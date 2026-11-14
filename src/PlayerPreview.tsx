import { useState } from "react";
import { teams } from "./data/teams";
import type { DraftView } from "./storage/saves";
const positions: Record<string, string> = {
  P: "投手",
  C: "捕手",
  "1B": "一塁",
  "2B": "二塁",
  "3B": "三塁",
  SS: "遊撃",
  LF: "左翼",
  CF: "中堅",
  RF: "右翼",
};
const hands = { R: "右", L: "左", S: "両" };
export function PlayerPreview({ draft }: { draft: DraftView }) {
  const [teamId, setTeamId] = useState(teams[0].id);
  const roster = draft.players.filter((player) => player.teamId === teamId);
  return (
    <details className="roster-preview">
      <summary>
        球団選択前に選手を確認（全12球団・{draft.players.length}人）
      </summary>
      <p className="hint">
        表示球団や操作球団の候補を切り替えても、選手は変わりません。
      </p>
      <label className="preview-team-label">
        選手を確認する球団
        <select
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        {roster.length}人 / 現在能力の簡易表示です。詳細画面は準備中です。
      </p>
      <ul>
        {roster.map((player) => (
          <li key={player.id}>
            <strong>{player.name}</strong>
            <span>
              {player.age}歳 / {hands[player.throws]}投{hands[player.bats]}打 /{" "}
              {positions[player.position]} /{" "}
              {player.registration === "senior" ? "支配下" : "育成"}
            </span>
            <p>{player.currentAbilities}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
