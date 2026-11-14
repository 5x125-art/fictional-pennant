import type {
  CareerBackground,
  FieldPosition,
  PitcherRole,
  PitchType,
} from "../../game/players/types";
export const positionLabels: Record<FieldPosition | "P", string> = {
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
export const handLabels = { R: "右", L: "左", S: "両" };
export const roleLabels: Record<PitcherRole, string> = {
  starter: "先発",
  closer: "抑え",
  setup: "セットアッパー",
  middle: "中継ぎ",
  long: "ロングリリーフ",
};
export const pitchLabels: Record<PitchType, string> = {
  fastball: "ストレート",
  slider: "スライダー",
  curve: "カーブ",
  changeup: "チェンジアップ",
  fork: "フォーク",
  sinker: "シンカー",
  cutter: "カットボール",
};
export const careerLabels: Record<CareerBackground, string> = {
  highSchool: "高卒",
  university: "大卒",
  corporate: "社会人",
  independent: "独立",
  foreign: "外国人",
};
