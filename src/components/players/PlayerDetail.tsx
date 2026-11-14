import { useId, useRef, useState } from "react";
import { getTeam } from "../../data/teams";
import type { PublicPlayer } from "../../game/players/publicPlayer";
import { fieldPositions } from "../../game/players/types";
import { AbilityValue } from "./AbilityValue";
import { PlayerStats } from "./PlayerStats";
import {
  careerLabels,
  handLabels,
  pitchLabels,
  positionLabels,
  roleLabels,
} from "./labels";
const detailTabs = ["基本情報・能力", "成績", "成長", "契約"] as const;
export function PlayerDetail({
  player,
  onBack,
}: {
  player: PublicPlayer | undefined;
  onBack: () => void;
}) {
  const [tab, setTab] = useState(0);
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  if (!player)
    return (
      <section className="player-detail">
        <p role="alert">選手が見つかりません。選手一覧へ戻ってください。</p>
        <button onClick={onBack}>選手一覧に戻る</button>
      </section>
    );
  const abilities =
    player.kind === "fielder"
      ? ([
          ["対右ミート", player.abilities.contactVsRight],
          ["対左ミート", player.abilities.contactVsLeft],
          ["パワー", player.abilities.power],
          ["走力", player.abilities.speed],
          ["盗塁", player.abilities.stealing],
          ["捕球", player.abilities.catching],
          ["スローイング", player.abilities.throwing],
          ["肩力", player.abilities.arm],
        ] as const)
      : ([
          ["制球", player.abilities.control],
          ["スタミナ", player.abilities.stamina],
          ["先発適性", player.abilities.starterSuitability],
          ["救援適性", player.abilities.reliefSuitability],
        ] as const);
  return (
    <section className="player-detail" aria-label="選手詳細">
      <button className="back-to-players" onClick={onBack}>
        ← 選手一覧に戻る
      </button>
      <header
        className="player-profile"
        style={{ borderLeftColor: getTeam(player.teamId).color }}
      >
        <p>
          {getTeam(player.teamId).name} /{" "}
          {player.kind === "pitcher" ? "投手" : "野手"}
        </p>
        <h2>{player.name}</h2>
        <p className="squad-detail">
          現在所属：
          {player.squad === "first"
            ? "1軍"
            : player.squad === "farm"
              ? "2軍"
              : "所属未取得"}
        </p>
        <p>
          {player.age}歳 / {handLabels[player.throws]}投
          {handLabels[player.bats]}打 / {positionLabels[player.primaryPosition]}{" "}
          / {player.registration === "senior" ? "支配下" : "育成"}
        </p>
      </header>
      <div className="detail-tabs" role="tablist" aria-label="選手詳細タブ">
        {detailTabs.map((label, index) => (
          <button
            key={label}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            role="tab"
            id={`${prefix}-tab-${index}`}
            aria-controls={`${prefix}-panel`}
            aria-selected={tab === index}
            tabIndex={tab === index ? 0 : -1}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % detailTabs.length
                  : event.key === "ArrowLeft"
                    ? (index + detailTabs.length - 1) % detailTabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? detailTabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setTab(next);
                buttons.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="detail-panel"
        id={`${prefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${prefix}-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 0 && (
          <>
            <h3>現在能力</h3>
            <dl className="ability-grid">
              {abilities.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <AbilityValue value={value} />
                  </dd>
                </div>
              ))}
              {player.kind === "fielder" ? (
                <div>
                  <dt>弾道</dt>
                  <dd>{player.abilities.trajectory}</dd>
                </div>
              ) : (
                <div>
                  <dt>球速</dt>
                  <dd>
                    {player.abilities.velocityKmh}
                    <small> km/h</small>
                  </dd>
                </div>
              )}
            </dl>
            {player.kind === "fielder" ? (
              <>
                <h3>守備位置別適性</h3>
                <dl className="ability-grid">
                  {fieldPositions.map((position) => (
                    <div key={position}>
                      <dt>{positionLabels[position]}</dt>
                      <dd>
                        <AbilityValue
                          value={player.positionAptitudes[position]}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <>
                <p className="pitcher-role">
                  投手役割：{roleLabels[player.role]}
                </p>
                <h3>所持球種</h3>
                <div className="pitch-list">
                  {player.abilities.pitches.map((pitch) => (
                    <section
                      className="pitch-card"
                      key={pitch.type}
                      aria-label={pitchLabels[pitch.type]}
                    >
                      <h4>{pitchLabels[pitch.type]}</h4>
                      <dl className="ability-grid">
                        <div>
                          <dt>球威</dt>
                          <dd>
                            <AbilityValue value={pitch.power} />
                          </dd>
                        </div>
                        <div>
                          <dt>制球</dt>
                          <dd>
                            <AbilityValue value={pitch.control} />
                          </dd>
                        </div>
                        <div>
                          <dt>変化量</dt>
                          <dd>{pitch.movement}</dd>
                        </div>
                      </dl>
                    </section>
                  ))}
                </div>
              </>
            )}
            <dl className="stat-grid physical-info">
              <div>
                <dt>体力</dt>
                <dd>{player.fitness}/100</dd>
              </div>
              <div>
                <dt>調子</dt>
                <dd>{player.condition}</dd>
              </div>
            </dl>
          </>
        )}
        {tab === 1 && <PlayerStats player={player} />}
        {tab === 2 && <p className="empty">成長記録は準備中</p>}
        {tab === 3 && (
          <>
            <h3>契約・経歴</h3>
            <dl className="contract-grid">
              {[
                ["年齢", `${player.age}歳`],
                ["入団経歴", careerLabels[player.career.background]],
                ["入団年齢", `${player.career.entryAge}歳`],
                [
                  "完了済みプロ在籍",
                  `${player.career.completedProSeasons}シーズン`,
                ],
                [
                  "登録区分",
                  player.registration === "senior" ? "支配下" : "育成",
                ],
                [
                  "年俸",
                  `${player.contract.annualSalaryManYen.toLocaleString("ja-JP")}万円`,
                ],
                ["契約年数", `${player.contract.years}年`],
                ["外国人選手", player.isForeign ? "はい" : "いいえ"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
