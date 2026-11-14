/** Mulberry32。シミュレーション用（秘密情報や認証用の乱数には使用しない）。 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError(
        "シード・復元状態は32bit符号なし整数で指定してください。",
      );
    }
    this.state = seed;
  }

  getState(): number {
    return this.state;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  }

  int(min: number, max: number): number {
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min > max ||
      max - min >= 0x100000000
    ) {
      throw new RangeError("乱数の整数範囲が不正です。");
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  between(range: readonly [number, number]): number {
    return this.int(range[0], range[1]);
  }

  pick<T>(values: readonly T[]): T {
    if (!values.length) throw new RangeError("空の候補からは選択できません。");
    return values[this.int(0, values.length - 1)];
  }
}
