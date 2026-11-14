import { afterEach, describe, expect, it, vi } from "vitest";
import { createSaveId } from "../game/saveId";

afterEach(() => vi.unstubAllGlobals());

describe("セーブID生成", () => {
  it("randomUUIDがあれば優先して使用する", () => {
    const id = "12345678-1234-4234-8234-123456789abc";
    const randomUUID = vi.fn(() => id);
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });
    expect(createSaveId()).toBe(id);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it.each([0x00, 0xff])(
    "randomUUIDがなければ安全な乱数でUUID v4を生成する（乱数値 %i）",
    (byte) => {
      const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(byte));
      vi.stubGlobal("crypto", { getRandomValues });
      const id = createSaveId();
      expect(getRandomValues).toHaveBeenCalledOnce();
      expect(getRandomValues.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
      expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
      expect(id).toBe(
        byte === 0
          ? "00000000-0000-4000-8000-000000000000"
          : "ffffffff-ffff-4fff-bfff-ffffffffffff",
      );
    },
  );

  it("安全な乱数生成が失敗した場合は弱い乱数で代用せず失敗する", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: () => {
        throw new Error("乱数生成失敗");
      },
    });
    expect(() => createSaveId()).toThrow("乱数生成失敗");
  });
});
