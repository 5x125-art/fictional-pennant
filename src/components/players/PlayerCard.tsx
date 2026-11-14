import { getTeam } from "../../data/teams";
import type { PublicPlayer } from "../../game/players/publicPlayer";
import { getSearchAbility, type PlayerQuery } from "../../game/players/search";
import { AbilityValue } from "./AbilityValue";
import { handLabels, positionLabels } from "./labels";
function MajorAbilities({ player }: { player: PublicPlayer }) {
  return (
    <span className="major-abilities">
      {player.kind === "pitcher" ? (
        <>
          <span className="major-stat">
            <span className="major-label">球速</span>
            <span className="major-value">
              {player.abilities.velocityKmh}
              <small> km/h</small>
            </span>
          </span>
          <span className="major-stat">
            <span className="major-label">制球</span>
            <span className="major-value">
              <AbilityValue value={player.abilities.control} />
            </span>
          </span>
          <span className="major-stat">
            <span className="major-label">スタミナ</span>
            <span className="major-value">
              <AbilityValue value={player.abilities.stamina} />
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="major-stat">
            <span className="major-label">対右ミート</span>
            <span className="major-value">
              <AbilityValue value={player.abilities.contactVsRight} />
            </span>
          </span>
          <span className="major-stat">
            <span className="major-label">対左ミート</span>
            <span className="major-value">
              <AbilityValue value={player.abilities.contactVsLeft} />
            </span>
          </span>
          <span className="major-stat">
            <span className="major-label">パワー</span>
            <span className="major-value">
              <AbilityValue value={player.abilities.power} />
            </span>
          </span>
          <span className="major-stat">
            <span className="major-label">走力</span>
            <span className="major-value">
              <AbilityValue value={player.abilities.speed} />
            </span>
          </span>
        </>
      )}
    </span>
  );
}

export function PlayerCard({
  player,
  query,
  onOpen,
}: {
  player: PublicPlayer;
  query: PlayerQuery;
  onOpen: () => void;
}) {
  const compared = [...new Set([query.ability, query.sort])]
    .map(getSearchAbility)
    .filter((ability) => ability && ability.value(player) !== undefined);
  return (
    <li>
      <button
        id={`player-row-${player.id}`}
        className="player-row"
        style={{ borderLeftColor: getTeam(player.teamId).color }}
        aria-label={`${player.name}の詳細`}
        onClick={onOpen}
      >
        <span className="player-row-heading">
          <strong>{player.name}</strong>
          <span className="player-row-tags">
            <span className="registration-tag">
              {player.kind === "pitcher" ? "投手" : "野手"}
            </span>
            <span className={`registration-tag ${player.registration}`}>
              {player.registration === "senior" ? "支配下" : "育成"}
            </span>
          </span>
        </span>
        <span className="player-card-team">{getTeam(player.teamId).name}</span>
        <span className="player-row-meta">
          {player.age}歳 / {handLabels[player.throws]}投
          {handLabels[player.bats]}打 / {positionLabels[player.primaryPosition]}
        </span>
        <MajorAbilities player={player} />
        {query.sort === "salary" && (
          <span className="comparison-value">
            年俸：{player.contract.annualSalaryManYen.toLocaleString("ja-JP")}
            万円
          </span>
        )}
        {compared.map(
          (ability) =>
            ability && (
              <span className="comparison-value" key={ability.id}>
                {ability.label}：
                {ability.unit === "kmh" ? (
                  `${ability.value(player)}km/h`
                ) : (
                  <AbilityValue value={ability.value(player)!} />
                )}
              </span>
            ),
        )}
        <span className="player-row-link">
          能力・成績を確認 <span aria-hidden="true">→</span>
        </span>
      </button>
    </li>
  );
}
