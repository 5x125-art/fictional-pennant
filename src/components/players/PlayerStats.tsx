import type { PublicPlayer } from "../../game/players/publicPlayer";
import type { BattingStats, PitchingStats } from "../../game/players/types";
import {
  battingAverage,
  earnedRunAverage,
  inningsPitched,
  relativeSeason,
} from "../../game/players/statistics";
import { getTeam } from "../../data/teams";
function battingRows(stats: BattingStats): [string, string | number][] {
  return [
    ["打率", battingAverage(stats.hits, stats.atBats)],
    ["試合", stats.games],
    ["打席", stats.plateAppearances],
    ["打数", stats.atBats],
    ["安打", stats.hits],
    ["二塁打", stats.doubles],
    ["三塁打", stats.triples],
    ["本塁打", stats.homeRuns],
    ["打点", stats.runsBattedIn],
    ["得点", stats.runs],
    ["四球", stats.walks],
    ["死球", stats.hitByPitches],
    ["三振", stats.strikeouts],
    ["盗塁", stats.stolenBases],
    ["盗塁死", stats.caughtStealing],
    ["犠打", stats.sacrificeBunts],
    ["犠飛", stats.sacrificeFlies],
  ];
}
function pitchingRows(stats: PitchingStats): [string, string | number][] {
  return [
    ["防御率", earnedRunAverage(stats.earnedRuns, stats.outs)],
    ["登板", stats.games],
    ["先発", stats.starts],
    ["投球回", inningsPitched(stats.outs)],
    ["勝利", stats.wins],
    ["敗戦", stats.losses],
    ["セーブ", stats.saves],
    ["ホールド", stats.holds],
    ["奪三振", stats.strikeouts],
    ["与四球", stats.walks],
    ["被安打", stats.hitsAllowed],
    ["被本塁打", stats.homeRunsAllowed],
    ["失点", stats.runsAllowed],
    ["自責点", stats.earnedRuns],
  ];
}
export function PlayerStats({ player }: { player: PublicPlayer }) {
  const records = [...player.history].sort((a, b) => b.season - a.season);
  return (
    <div className="player-stats">
      <h3>過去年度の架空成績</h3>
      <p className="panel-note">
        初期生成時の架空の記録です。試合処理は未実装で、今季成績はありません。
      </p>
      <p className="panel-note">
        分母0の率は「—」。投球回の .1 は1/3回、.2 は2/3回です。
      </p>
      {!records.length && (
        <p className="empty">保存済みの過去成績はありません。</p>
      )}
      {records.map((record, index) => (
        <details
          className="season-record"
          key={`${record.season}-${index}`}
          open={index === 0}
        >
          <summary>
            {relativeSeason(record.season)}{" "}
            <span>
              {record.age}歳 / {getTeam(record.teamId).name}
            </span>
          </summary>
          <div className="season-levels">
            {(["firstTeam", "farmTeam"] as const).map((level) => {
              const stats = record[level];
              const label = level === "firstTeam" ? "1軍" : "2軍";
              const rows =
                player.kind === "fielder"
                  ? battingRows(stats as BattingStats)
                  : pitchingRows(stats as PitchingStats);
              return (
                <section
                  className="level-stats"
                  key={level}
                  aria-label={`${relativeSeason(record.season)}の${label}成績`}
                >
                  <h4>
                    {label}
                    {stats.games === 0 && (
                      <span className="registration-tag">未出場</span>
                    )}
                  </h4>
                  <dl className="stat-grid">
                    {rows.map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
