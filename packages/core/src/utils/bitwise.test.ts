import { describe, expect, it } from "vitest";

import { digitToMask, maskToSingleDigit, resolveCandidates } from "./bitwise.js";

describe("digitToMask", () => {
  it("maps digit 1 to the lowest bit (0b1)", () => {
    expect(digitToMask(1)).toBe(0b1);
  });

  it("maps digit 9 to the highest bit (0b100000000)", () => {
    expect(digitToMask(9)).toBe(0b100000000);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])("sets exactly one bit for digit %i", (digit) => {
    const mask = digitToMask(digit);
    expect(mask).toBeGreaterThan(0);
    // Exactly one bit set: mask & (mask - 1) === 0 for power-of-two values.
    expect(mask & (mask - 1)).toBe(0);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "places the bit at position digit - 1 for digit %i",
    (digit) => {
      expect(digitToMask(digit)).toBe(1 << (digit - 1));
    },
  );

  it("produces distinct, non-overlapping masks for all digits", () => {
    const masks = Array.from({ length: 9 }, (_, i) => digitToMask(i + 1));
    const combined = masks.reduce((acc, mask) => acc | mask, 0);
    expect(new Set(masks).size).toBe(9);
    // All nine bits set: 0b111111111 = 511.
    expect(combined).toBe(0b111111111);
  });
});

describe("maskToSingleDigit", () => {
  it("returns 1 for the mask with only the lowest bit set", () => {
    expect(maskToSingleDigit(0b1)).toBe(1);
  });

  it("returns 9 for the mask with only the highest bit set", () => {
    expect(maskToSingleDigit(0b100000000)).toBe(9);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])("round-trips digit %i through digitToMask", (digit) => {
    expect(maskToSingleDigit(digitToMask(digit))).toBe(digit);
  });

  it("returns null for an empty mask", () => {
    expect(maskToSingleDigit(0)).toBeNull();
  });

  it.each([
    [0b11, "two adjacent bits"],
    [0b100000001, "bits 1 and 9"],
    [0b111111111, "all nine bits"],
    [0b101010101, "every other bit"],
  ])("returns null for a mask with %s (%s)", (mask) => {
    expect(maskToSingleDigit(mask)).toBeNull();
  });
});

describe("resolveCandidates", () => {
  describe('with output "boolean"', () => {
    it("returns nine flags", () => {
      expect(resolveCandidates(0, "boolean")).toHaveLength(9);
    });

    it("flags only the lowest position for digit 1", () => {
      expect(resolveCandidates(digitToMask(1), "boolean")).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    });

    it("flags only the highest position for digit 9", () => {
      expect(resolveCandidates(digitToMask(9), "boolean")).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
      ]);
    });

    it("returns all false for an empty mask", () => {
      expect(resolveCandidates(0, "boolean")).toEqual(Array<boolean>(9).fill(false));
    });

    it("returns all true for the mask with all nine bits set", () => {
      expect(resolveCandidates(0b111111111, "boolean")).toEqual(Array<boolean>(9).fill(true));
    });

    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
      "flags position digit - 1 for digit %i",
      (digit) => {
        const flags = resolveCandidates(digitToMask(digit), "boolean");
        const setPositions = flags.flatMap((isSet, i) => (isSet ? [i] : []));
        expect(setPositions).toEqual([digit - 1]);
      },
    );
  });

  describe('with output "number"', () => {
    it("returns an empty array for an empty mask", () => {
      expect(resolveCandidates(0, "number")).toEqual([]);
    });

    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
      "round-trips digit %i through digitToMask",
      (digit) => {
        expect(resolveCandidates(digitToMask(digit), "number")).toEqual([digit]);
      },
    );

    it("returns every digit in ascending order for the mask with all nine bits set", () => {
      expect(resolveCandidates(0b111111111, "number")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("returns digits in ascending order regardless of bit layout", () => {
      expect(resolveCandidates(0b101010101, "number")).toEqual([1, 3, 5, 7, 9]);
      expect(resolveCandidates(0b010101010, "number")).toEqual([2, 4, 6, 8]);
    });

    it("returns digits matching the bits set by digitToMask for all digits", () => {
      const masks = Array.from({ length: 9 }, (_, i) => digitToMask(i + 1));
      const combined = masks.reduce((acc, mask) => acc | mask, 0);
      expect(resolveCandidates(combined, "number")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("ignores bits outside the nine digit positions", () => {
      expect(resolveCandidates(0b1 | (1 << 9), "number")).toEqual([1]);
    });
  });

  it("keeps boolean and number outputs consistent for the same mask", () => {
    const flags = resolveCandidates(0b010101010, "boolean");
    const digits = resolveCandidates(0b010101010, "number");
    expect(flags.flatMap((isSet, i) => (isSet ? [i + 1] : []))).toEqual(digits);
  });
});
