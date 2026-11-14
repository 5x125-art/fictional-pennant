import { useEffect, useState } from "react";
import { getTeam, leagues, teams } from "../../data/teams";
import { readPublicRoster, type PublicRoster } from "../../storage/playerViews";
import { storageErrorMessage } from "../../game/saveErrors";
import type { PublicPlayer } from "../../game/players/publicPlayer";
import { PlayerDetail } from "./PlayerDetail";
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
export function PlayersScreen({
  saveId,
  onHome,
}: {
  saveId: string | null;
  onHome: () => void;
}) {
  const [roster, setRoster] = useState<PublicRoster | null>(null);
  const [teamId, setTeamId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRoster(null);
    setError("");
    setSelectedId(null);
    if (saveId)
      readPublicRoster(saveId)
        .then((result) => {
          if (!cancelled) {
            setRoster(result);
            setTeamId(result.managedTeamId);
          }
        })
        .catch((error) => {
          if (!cancelled) setError(storageErrorMessage(error));
        });
    return () => {
      cancelled = true;
    };
  }, [saveId, retry]);
  if (!saveId)
    return (
      <section className="player-screen empty-players">
        <h2>選手一覧</h2>
        <p>セーブを読み込むと、保存済みの選手を確認できます。</p>
        <button onClick={onHome}>ホームでセーブを選ぶ</button>
      </section>
    );
  if (error)
    return (
      <section className="player-screen">
        <p role="alert">選手を読み込めませんでした。{error}</p>
        <button onClick={() => setRetry((value) => value + 1)}>
          再読み込み
        </button>
        <button onClick={onHome}>ホームへ戻る</button>
      </section>
    );
  if (!roster)
    return (
      <section className="player-screen">
        <p role="status" aria-label="選手データ">
          保存済みの選手を読み込み中…
        </p>
      </section>
    );
  const players = roster.players.filter((player) => player.teamId === teamId);
  if (selectedId !== null)
    return (
      <div className="player-screen">
        <PlayerDetail
          key={selectedId}
          player={roster.players.find((player) => player.id === selectedId)}
          onBack={() => {
            setSelectedId(null);
            window.scrollTo(0, 0);
          }}
        />
      </div>
    );
  return (
    <section className="player-screen" aria-label="選手一覧">
      <div className="roster-heading">
        <div>
          <span className="eyebrow">PLAYER ROSTER</span>
          <h2>{getTeam(teamId).name}</h2>
          <p>
            {players.length}人 / 支配下{" "}
            {
              players.filter((player) => player.registration === "senior")
                .length
            }
            人 / 育成{" "}
            {
              players.filter((player) => player.registration === "development")
                .length
            }
            人
          </p>
        </div>
        <span className="roster-own-label">
          {teamId === roster.managedTeamId ? "自球団" : "他球団"}
        </span>
      </div>
      <label className="roster-team-select">
        表示する球団
        <select
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
        >
          {leagues.map((league) => (
            <optgroup label={league.name} key={league.id}>
              {teams
                .filter((team) => team.league === league.id)
                .map((team) => (
                  <option value={team.id} key={team.id}>
                    {team.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {(["pitcher", "fielder"] as const).map((kind) => (
        <section
          className="roster-group"
          key={kind}
          aria-label={kind === "pitcher" ? "投手一覧" : "野手一覧"}
        >
          <h3>
            {kind === "pitcher" ? "投手" : "野手"}
            <span>
              {players.filter((player) => player.kind === kind).length}人
            </span>
          </h3>
          <ul className="player-list">
            {players
              .filter((player) => player.kind === kind)
              .map((player) => (
                <li key={player.id}>
                  <button
                    className="player-row"
                    style={{ borderLeftColor: getTeam(player.teamId).color }}
                    aria-label={`${player.name}の詳細`}
                    onClick={() => {
                      setSelectedId(player.id);
                      window.scrollTo(0, 0);
                    }}
                  >
                    <span className="player-row-heading">
                      <strong>{player.name}</strong>
                      <span
                        className={`registration-tag ${player.registration}`}
                      >
                        {player.registration === "senior" ? "支配下" : "育成"}
                      </span>
                    </span>
                    <span className="player-row-meta">
                      {player.age}歳 / {handLabels[player.throws]}投
                      {handLabels[player.bats]}打 /{" "}
                      {positionLabels[player.primaryPosition]}
                    </span>
                    <MajorAbilities player={player} />
                    <span className="player-row-link">
                      能力・成績を確認 <span aria-hidden="true">→</span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          {!players.some((player) => player.kind === kind) && (
            <p className="empty">保存済みの選手はいません。</p>
          )}
        </section>
      ))}
    </section>
  );
}
