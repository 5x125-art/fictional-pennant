import { useEffect, useState, type CSSProperties } from "react";
import { getTeam, leagues, teams } from "./data/teams";
import { loadSave, newSave, readSaves, saveCurrent } from "./storage/saves";
import type { GameSave } from "./game/save";
const tabs = ["ホーム", "選手", "日程", "データ", "球団運営"] as const;
type Tab = (typeof tabs)[number];
const descriptions: Record<Exclude<Tab, "ホーム">, string> = {
  選手: "選手一覧・能力・成績は、今後の開発で追加します。",
  日程: "日程と試合の進行は、今後の開発で追加します。",
  データ: "順位表・試合結果・個人成績は、今後の開発で追加します。",
  球団運営: "編成・育成・契約は、今後の開発で追加します。",
};
const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});
export function App() {
  const [tab, setTab] = useState<Tab>("ホーム");
  const [state, setState] = useState<{
    saves: GameSave[];
    activeId: string | null;
  }>({ saves: [], activeId: null });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const active = state.saves.find((save) => save.id === state.activeId);
  const team = active ? getTeam(active.teamId) : null;
  useEffect(() => {
    readSaves()
      .then(setState)
      .catch(() =>
        setError(
          "セーブを読み込めませんでした。ブラウザの保存設定を確認して再読み込みしてください。既存データは変更していません。",
        ),
      )
      .finally(() => setBusy(false));
  }, []);
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setState(await readSaves());
      setCreating(false);
      setSelected("");
      setMessage(success);
    } catch {
      setError(
        "操作を完了できませんでした。保存容量やブラウザの設定を確認して、もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <span className="eyebrow">FICTIONAL PENNANT</span>
          <p>
            架空ペナント<span className="edition">球団運営ゲーム</span>
          </p>
        </div>
        <span className="phase">PHASE 1</span>
      </header>
      <main>
        <div className="page-heading">
          <span className="eyebrow">YOUR CLUB, YOUR STORY</span>
          <h1>{tab}</h1>
          <p>12球団から始まる、あなただけの球団運営。</p>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <p className="status" role="status">
          {busy ? "読み込み・保存中…" : message}
        </p>
        {tab === "ホーム" ? (
          <>
            {team && active && !creating && (
              <section
                className="club-panel"
                style={{ "--team-color": team.color } as CSSProperties}
                aria-label="現在の操作球団"
              >
                <span className="eyebrow">MY CLUB</span>
                <p className="league-label">
                  {leagues.find((league) => league.id === team.league)?.name}
                </p>
                <h2>{team.name}</h2>
                <p>このセーブの操作球団です。途中で変更はできません。</p>
                <div className="club-footer">
                  <span>スロット {state.saves.indexOf(active) + 1}</span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(
                        () => saveCurrent(active.id),
                        "現在のスロットに保存しました。",
                      )
                    }
                  >
                    手動保存
                  </button>
                </div>
              </section>
            )}
            {(!active || creating) && (
              <section className="selection" aria-labelledby="select-heading">
                <div className="section-heading">
                  <span className="step">01</span>
                  <div>
                    <h2 id="select-heading">あなたの球団を選ぶ</h2>
                    <p>新しいスロットを作成して、ゲームを始めます。</p>
                  </div>
                </div>
                <p className="hint">
                  操作球団はセーブごとに固定されます。別の球団で始める場合は、新しいスロットを作成してください。
                </p>
                <fieldset disabled={busy}>
                  <legend className="sr-only">操作球団</legend>
                  <div className="leagues">
                    {leagues.map((league) => (
                      <section
                        className={`league ${league.id}`}
                        key={league.id}
                      >
                        <h3>
                          {league.name}
                          <span>6球団</span>
                        </h3>
                        <div className="team-list">
                          {teams
                            .filter((team) => team.league === league.id)
                            .map((team) => (
                              <label
                                className={`team-option ${selected === team.id ? "selected" : ""}`}
                                key={team.id}
                                style={
                                  {
                                    "--team-color": team.color,
                                  } as CSSProperties
                                }
                              >
                                <input
                                  type="radio"
                                  name="team"
                                  value={team.id}
                                  checked={selected === team.id}
                                  onChange={() => setSelected(team.id)}
                                />
                                <span
                                  className="color-bar"
                                  aria-hidden="true"
                                />
                                <span>{team.name}</span>
                              </label>
                            ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </fieldset>
                <div className="selection-actions">
                  <p>
                    {selected
                      ? `${getTeam(selected).name}で開始します`
                      : "操作する球団を1つ選択してください"}
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !selected}
                    onClick={() =>
                      perform(
                        () => newSave(selected),
                        "新しいセーブを作成しました。",
                      )
                    }
                  >
                    この球団で始める<span aria-hidden="true"> →</span>
                  </button>
                  {active && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setCreating(false);
                        setSelected("");
                      }}
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </section>
            )}
            <section className="saves" aria-labelledby="saves-heading">
              <div className="section-heading">
                <span className="step">02</span>
                <div>
                  <h2 id="saves-heading">セーブスロット</h2>
                  <p>このブラウザに保存したゲーム</p>
                </div>
              </div>
              {state.saves.length ? (
                <ul>
                  {state.saves.map((save, index) => (
                    <li
                      key={save.id}
                      className={
                        save.id === state.activeId ? "active-slot" : undefined
                      }
                      style={
                        {
                          "--team-color": getTeam(save.teamId).color,
                        } as CSSProperties
                      }
                    >
                      <div>
                        <span className="slot-number">
                          SLOT {String(index + 1).padStart(2, "0")}
                        </span>
                        <h3>{getTeam(save.teamId).name}</h3>
                        <p>
                          最終保存：
                          {dateFormat.format(new Date(save.updatedAt))}
                        </p>
                      </div>
                      <button
                        disabled={busy || save.id === state.activeId}
                        onClick={() =>
                          perform(
                            () => loadSave(save.id),
                            "セーブを読み込みました。",
                          )
                        }
                      >
                        {save.id === state.activeId ? "プレイ中" : "読み込む"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">
                  セーブはまだありません。球団を選んで最初の一歩を。
                </p>
              )}
              {active && !creating && (
                <button
                  className="new-slot"
                  disabled={busy}
                  onClick={() => {
                    setCreating(true);
                    setSelected("");
                  }}
                >
                  ＋ 新しいスロットで始める
                </button>
              )}
              <p className="hint">
                セーブはこの端末・ブラウザ内に保存されます。ブラウザのデータを削除すると失われます。
              </p>
            </section>
            <aside className="coming">
              <span className="badge">準備中</span>
              <div>
                <h2>ペナントの開幕に向けて</h2>
                <p>
                  選手・試合・日程・編成は今後追加します。現在は球団選択とセーブ機能を利用できます。
                </p>
              </div>
            </aside>
          </>
        ) : (
          <section className="placeholder">
            <span className="eyebrow">COMING SOON</span>
            <h2>{tab}</h2>
            <span className="badge">準備中</span>
            <p>{descriptions[tab]}</p>
            <button onClick={() => setTab("ホーム")}>ホームへ戻る</button>
          </section>
        )}
      </main>
      <nav className="bottom-nav" aria-label="メインメニュー">
        {tabs.map((item, index) => (
          <button
            key={item}
            aria-current={tab === item ? "page" : undefined}
            onClick={() => setTab(item)}
          >
            <span className="nav-mark" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d={
                    [
                      "M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8",
                      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
                      "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2",
                      "M4 3v18h17M8 16v-5M13 16V7M18 16v-8",
                      "M3 21h18M5 21V5h14v16M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4",
                    ][index]
                  }
                />
              </svg>
            </span>
            {item}
          </button>
        ))}
      </nav>
    </div>
  );
}
