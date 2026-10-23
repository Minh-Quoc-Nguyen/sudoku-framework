import { describe, expect, it } from "vitest";
import type { Board, Cell } from "../../../types/board.type.js";
import { getUnit } from "../../../utils/board.js";
import { indexToMask } from "../../../utils/bitwise.js";
import { applySimpleModifications } from "./common.js";

const solved: Cell = { value: 9, candidates: indexToMask(9) };
const unsolved = (candidates: number): Cell => ({ value: null, candidates });
const bits = (...digits: number[]): number => digits.reduce((mask, digit) => mask | indexToMask(digit), 0);

const boardWith = (overrides: Record<number, Cell>): Board => {
  const board: Board = Array.from({ length: 81 }, () => solved);
  for (const [index, cell] of Object.entries(overrides)) board[Number(index)] = cell;
  return board;
};

describe("applySimpleModifications", () => {
  it("composes the peer eliminations of every placement in the batch", () => {
    // 0, 1 and 2 share a row, so 2 is a peer of both placements and must lose
    // both placed digits. Reading peer candidates from the stale input board
    // instead of the partially updated copy keeps 1 in cell 2.
    const board = boardWith({ 0: unsolved(bits(1, 2, 3)), 1: unsolved(bits(1, 2, 3)), 2: unsolved(bits(1, 2, 3)) });

    const next = applySimpleModifications(board, [
      { index: 0, value: 1 },
      { index: 1, value: 2 },
    ]);

    expect(next).not.toBeNull();
    expect(getUnit(next ?? [], 0)).toEqual({ value: 1, candidates: indexToMask(1) });
    expect(getUnit(next ?? [], 1)).toEqual({ value: 2, candidates: indexToMask(2) });
    expect(getUnit(next ?? [], 2).candidates).toBe(indexToMask(3));
  });

  it("leaves the input board untouched", () => {
    const board = boardWith({ 0: unsolved(bits(1, 2)), 1: unsolved(bits(1, 2)) });
    const before = [...board];

    applySimpleModifications(board, [{ index: 0, value: 1 }]);

    board.forEach((cell, index) => {
      expect(cell).toBe(before[index]);
    });
  });

  it("returns null when there is nothing to apply", () => {
    expect(applySimpleModifications(boardWith({ 0: unsolved(bits(1, 2)) }), null)).toBeNull();
  });
});
