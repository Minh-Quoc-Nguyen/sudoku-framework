import type { Board } from "../types/board.type.js";
import type { Algorithm } from "../types/solver.type.js";
import { BOX_OF, BOXES, COLUMN_OF, HOUSES, LINES, ROW_OF, XY_BOXES } from "../constants/cordinates.js";
import { indexToMask, maskToIndex } from "../utils/bitwise.js";
import { getCell, getPeers, removeCandidate, sanitizeCandidates } from "./common.js";
import type { Tuple } from "../types/common.type.js";

// Simple value assignment algs return the modification to prevent board instance creation, memory allocation and hand more control to caller
interface SimpleModification {
  index: number;
  value: number;
}

export function solveAll(board: Board): Board {
  let solvingBoard = board;
  let solution = solveStep(solvingBoard, { candidates: "rebuild" });

  while (solution) {
    solvingBoard = solution.board;
    solution = solveStep(solvingBoard, { candidates: "trust" });
  }

  return solvingBoard;
}

export function solveStep(board: Board, { candidates = "sanitize" }: { candidates?: "trust" | "sanitize" | "rebuild" } = {}): { board: Board; alg: Algorithm } | null {
  // Rebuild regardless if explicitly set
  let newBoard = candidates === "rebuild" ? sanitizeCandidates(board, true) : [...board];

  const fullHouse = solveFullHouse(newBoard);
  if (fullHouse) return { board: fullHouse, alg: "FullHouse" };

  // Sanitize obvious candidates if untrusted, ready for higher algs
  if (candidates !== "rebuild") newBoard = candidates === "trust" ? newBoard : sanitizeCandidates(newBoard);

  const hiddenSingleBox = solveHiddenSingleBox(newBoard);
  if (hiddenSingleBox) return { board: hiddenSingleBox, alg: "HiddenSingleBox" };

  const hiddenSingleLine = solveHiddenSingleLine(newBoard);
  if (hiddenSingleLine) return { board: hiddenSingleLine, alg: "HiddenSingleLine" };

  const nakedSingle = solveNakedSingle(newBoard);
  if (nakedSingle) return { board: nakedSingle, alg: "NakedSingle" };

  const pointingPairs = solvePointingPairs(newBoard);
  if (pointingPairs) return { board: pointingPairs, alg: "PointingPairs" };

  // No solution
  return null;
}

function applySimpleModification(board: Board, modification: SimpleModification | null): Board | null {
  if (modification === null) return null;
  const peers = getPeers(modification.index);
  const newBoard = [...board];
  const cell = getCell(newBoard, modification.index);
  const mask = indexToMask(modification.value);

  // Modify cell
  newBoard[modification.index] = { ...cell, value: modification.value, candidates: mask };

  // Modify peers
  for (const peer of peers) newBoard[peer] = removeCandidate(board, peer, mask);

  return newBoard;
}

// Full house: a house with exactly one empty cell -> missing digit = 45 - sum of filled
function findFullHouse(board: Board): SimpleModification | null {
  boxLoop: for (const house of HOUSES) {
    let sum = 0;
    let missingIndex: number | null = null;

    for (const cellIndex of house) {
      const cell = getCell(board, cellIndex);
      if (cell.value) {
        sum += cell.value;
      } else if (missingIndex === null) {
        missingIndex = cellIndex;
      } else {
        continue boxLoop;
      }
    }

    // Fully filled box: no empty cell found, nothing to place
    if (missingIndex === null) continue;

    return { index: missingIndex, value: 45 - sum };
  }

  return null;
}

function solveFullHouse(board: Board): Board | null {
  return applySimpleModification(board, findFullHouse(board));
}

// Hidden single: Within a unit, a value only appear as a candidate once
function findHiddenSingleUnit(board: Board, units: readonly (readonly number[])[]): SimpleModification | null {
  for (const unit of units) {
    // seenOnce: digits that are a candidate in >= 1 cell
    // seenTwice: digits that are a candidate in >= 2 cells
    let seenOnce = 0;
    let seenTwice = 0;

    for (const index of unit) {
      const cell = getCell(board, index);
      if (cell.value !== null) continue;

      const c = cell.candidates;
      seenTwice |= seenOnce & c; // already seen before AND in this cell -> duplicate
      seenOnce |= c;
    }

    // Digits with exactly one possible cell in this box
    const unique = seenOnce & ~seenTwice;
    if (unique === 0) continue; // common case: no hidden single in this box

    // Isolate lowest set bit; any hidden single is valid, so take the first
    const bit = unique & -unique;
    const value = maskToIndex(bit);
    if (!value) continue;

    // Second pass: find the single cell that holds this digit as a candidate
    for (const index of unit) {
      const cell = getCell(board, index);
      if (cell.value === null && (cell.candidates & bit) !== 0) return { index, value };
    }
  }

  return null;
}

function findHiddenSingleBox(board: Board): SimpleModification | null {
  return findHiddenSingleUnit(board, BOXES);
}

function solveHiddenSingleBox(board: Board): Board | null {
  return applySimpleModification(board, findHiddenSingleBox(board));
}

function findHiddenSingleLine(board: Board): SimpleModification | null {
  return findHiddenSingleUnit(board, LINES);
}

function solveHiddenSingleLine(board: Board): Board | null {
  return applySimpleModification(board, findHiddenSingleLine(board));
}

// Naked single: Cell only has one candidate
function findNakedSingle(board: Board): SimpleModification | null {
  for (let i = 0; i < 81; i++) {
    const cell = getCell(board, i);
    if (cell.value) continue;
    const value = maskToIndex(cell.candidates);
    if (value) return { index: i, value };
  }
  return null;
}

function solveNakedSingle(board: Board): Board | null {
  return applySimpleModification(board, findNakedSingle(board));
}

interface PointingPair {
  keep: number[];
  remove: number[];
  value: number;
}

// Pointing pairs: a digit is confined to one row/column of a box AND
function findPointingPairs(board: Board): PointingPair | null {
  const AXES = [0, 1, 2] as const;
  const OTHER_AXES = [
    [1, 2],
    [0, 2],
    [0, 1],
  ] as const;

  // Tries every digit in `only`; returns the first one that has a real elimination.
  // line = the 3 box cells on the aligned row/col, unitOf = ROW_OF or COLUMN_OF
  const resolve = (only: number, line: number[], unitOf: readonly (readonly number[])[]): PointingPair | null => {
    // Iterate set bits: the lowest digit may yield no elimination while a later one does
    for (let m = only; m !== 0; m &= m - 1) {
      const bit = m & -m;
      const value = maskToIndex(bit);
      if (value === null) continue; // unreachable (single bit), kept for type narrowing

      // keep: cells inside the box that still hold the digit
      const keep = line.filter((i) => getCell(board, i).candidates & bit);
      if (keep.length === 0) continue;

      // remove: cells in the same row/col but OUTSIDE the box that still hold the digit
      // keep[0] is `number | undefined` under noUncheckedIndexedAccess; guard once and reuse
      const first = keep[0];
      if (first === undefined) continue;

      // Widen the accessor tuples to plain readonly number[]:
      // .includes(i) on a fixed-length/literal tuple rejects a plain `number`
      const boxCells: readonly number[] = BOX_OF[first] ?? [];
      const unitCells: readonly number[] = unitOf[first] ?? [];

      // remove: same row/col, outside the box, still holding the digit as a candidate
      const remove = unitCells.filter((i) => {
        if (boxCells.includes(i)) return false;
        const cell = getCell(board, i);
        return cell.value === null && (cell.candidates & bit) !== 0;
      });

      // No elimination => not a valid pointing pair, try next digit
      if (remove.length === 0) continue;
      return { keep, remove, value };
    }
    return null;
  };

  for (const box of XY_BOXES) {
    const rowMask: Tuple<number, 3> = [0, 0, 0];
    const colMask: Tuple<number, 3> = [0, 0, 0];
    // Solved cells have candidates === themselves; mask them out to avoid false hits
    let solvedMask = 0;

    for (const x of AXES) {
      for (const y of AXES) {
        const cell = getCell(board, box[x][y]);
        rowMask[y] |= cell.candidates;
        colMask[x] |= cell.candidates;
        if (cell.value !== null) solvedMask |= indexToMask(cell.value);
      }
    }

    // Rows first (priority)
    for (const y of AXES) {
      const [a, b] = OTHER_AXES[y];
      const only = rowMask[y] & ~rowMask[a] & ~rowMask[b] & ~solvedMask;
      if (only === 0) continue;

      const hit = resolve(
        only,
        AXES.map((x) => box[x][y]),
        ROW_OF,
      );
      if (hit) return hit;
    }

    // Columns, only reached if no row hit in this box
    for (const x of AXES) {
      const [a, b] = OTHER_AXES[x];
      const only = colMask[x] & ~colMask[a] & ~colMask[b] & ~solvedMask;
      if (only === 0) continue;

      const hit = resolve(
        only,
        AXES.map((y) => box[x][y]),
        COLUMN_OF,
      );
      if (hit) return hit;
    }
  }
  return null;
}

function solvePointingPairs(board: Board): Board | null {
  const solution = findPointingPairs(board);
  if (!solution) return null;
  const newBoard = [...board];
  const mask = indexToMask(solution.value);
  for (const index of solution.remove) newBoard[index] = removeCandidate(board, index, mask);
  return newBoard;
}
