export const leagues = [
  { id: "blue", name: "ブルーリーグ" },
  { id: "red", name: "レッドリーグ" },
] as const;
export type LeagueId = (typeof leagues)[number]["id"];
export interface Team {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly league: LeagueId;
  readonly color: string;
}
// カラー値はPhase 1の表示用初期案。確定済みの球団名・所属は変更しない。
export const teams: readonly Team[] = [
  {
    id: "sapporo",
    name: "札幌オーロラズ",
    city: "札幌",
    league: "blue",
    color: "#6856a6",
  },
  {
    id: "niigata",
    name: "新潟リヴァーズ",
    city: "新潟",
    league: "blue",
    color: "#198b97",
  },
  {
    id: "yokohama",
    name: "横浜セイラーズ",
    city: "横浜",
    league: "blue",
    color: "#2363b0",
  },
  {
    id: "nagoya",
    name: "名古屋グリフィンズ",
    city: "名古屋",
    league: "blue",
    color: "#a47b20",
  },
  {
    id: "kobe",
    name: "神戸アンカーズ",
    city: "神戸",
    league: "blue",
    color: "#384e75",
  },
  {
    id: "fukuoka",
    name: "福岡ストームズ",
    city: "福岡",
    league: "blue",
    color: "#23715e",
  },
  {
    id: "sendai",
    name: "仙台フォレスターズ",
    city: "仙台",
    league: "red",
    color: "#567337",
  },
  {
    id: "tokyo",
    name: "東京コメッツ",
    city: "東京",
    league: "red",
    color: "#a04b82",
  },
  {
    id: "shizuoka",
    name: "静岡ピークス",
    city: "静岡",
    league: "red",
    color: "#217b77",
  },
  {
    id: "osaka",
    name: "大阪スパークス",
    city: "大阪",
    league: "red",
    color: "#c26a27",
  },
  {
    id: "hiroshima",
    name: "広島フレアーズ",
    city: "広島",
    league: "red",
    color: "#b83e46",
  },
  {
    id: "matsuyama",
    name: "松山シトラス",
    city: "松山",
    league: "red",
    color: "#a38b18",
  },
];
export function getTeam(id: string): Team {
  const team = teams.find((team) => team.id === id);
  if (!team) throw new Error("球団情報を読み込めません。");
  return team;
}
