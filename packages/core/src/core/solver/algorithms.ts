import { IllegalStateError } from "../../classes/errors.js";
import { COL_MASKS, LINE_MASKS, ROW_MASKS } from "../../constants/bitwise.js";
import { BOX_OUTSIDE_COLUMN_OF, BOX_OUTSIDE_ROW_OF, BOXES, COLUMN_OUTSIDE_BOX_OF, COLUMNS, HOUSES, LINES, PEERS, ROW_OUTSIDE_BOX_OF, ROWS } from "../../constants/cordinates.js";
import type { Board, Cell } from "../../types/board.type.js";
import { countSetBits, indexToMask, lowestSetIndex, maskToIndex, setBitIndices } from "../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit, removeCandidate } from "../../utils/board.js";

// Simple value assignment algs return the modification to prevent board instance creation, memory allocation and hand more control to caller
interface SimpleModification {
  index: number;
  value: number;
}

function applySimpleModification(board: Board, modification: SimpleModification | null): Board | null {
  if (modification === null) return null;
  const newBoard = [...board];
  const cell = getUnit(newBoard, modification.index);
  const mask = indexToMask(modification.value);

  // Modify cell
  newBoard[modification.index] = { ...cell, value: modification.value, candidates: mask };

  // Modify peers
  const peers = getUnit(PEERS, modification.index);
  for (const peer of peers) newBoard[peer] = removeCandidate(board, peer, mask);

  return newBoard;
}

// Full house: a house with exactly one empty cell -> missing digit = 45 - sum of filled
function findFullHouse(board: Board): SimpleModification | null {
  houseLoop: for (const house of HOUSES) {
    let sum = 0;
    let missingIndex: number | null = null;

    for (const cellIndex of house) {
      const cell = getUnit(board, cellIndex);
      if (cell.value) {
        sum += cell.value;
      } else if (missingIndex === null) {
        missingIndex = cellIndex;
      } else {
        continue houseLoop;
      }
    }

    // Fully filled house: no empty cell found, nothing to place
    if (missingIndex === null) continue;

    return { index: missingIndex, value: 45 - sum };
  }

  return null;
}

export function solveFullHouse(board: Board): Board | null {
  return applySimpleModification(board, findFullHouse(board));
}

// Hidden single: Within a unit, a value only appear as a candidate once
function findHiddenSingleUnit(board: Board, units: readonly (readonly number[])[]): SimpleModification | null {
  for (const unit of units) {
    let seenOnce = 0;
    let seenTwice = 0;
    // Store to reuse
    const validCells: { cell: Cell; index: number }[] = [];
    for (const index of unit) {
      const cell = getUnit(board, index);
      // Has value, irrelevant
      if (cell.value !== null) continue;

      validCells.push({ cell, index });
      const c = cell.candidates;
      seenTwice |= seenOnce & c;
      seenOnce |= c;
    }

    // Find smallest digit that's unique
    const value = lowestSetIndex(seenOnce & ~seenTwice);
    if (value === null) continue;
    const digitMask = indexToMask(value);

    // Filter for said cell
    for (const { cell, index } of validCells) {
      if ((cell.candidates & digitMask) !== 0) return { index, value };
    }
  }

  return null;
}

function findHiddenSingleBox(board: Board): SimpleModification | null {
  return findHiddenSingleUnit(board, BOXES);
}

export function solveHiddenSingleBox(board: Board): Board | null {
  return applySimpleModification(board, findHiddenSingleBox(board));
}

function findHiddenSingleLine(board: Board): SimpleModification | null {
  return findHiddenSingleUnit(board, LINES);
}

export function solveHiddenSingleLine(board: Board): Board | null {
  return applySimpleModification(board, findHiddenSingleLine(board));
}

// Naked single: Cell only has one candidate
function findNakedSingle(board: Board): SimpleModification | null {
  for (let i = 0; i < 81; i++) {
    const cell = getUnit(board, i);
    if (cell.value) continue;
    const value = maskToIndex(cell.candidates);
    if (value) return { index: i, value };
  }
  return null;
}

export function solveNakedSingle(board: Board): Board | null {
  return applySimpleModification(board, findNakedSingle(board));
}

// Pointing pairs helper
function filterCellCandidates(board: Board, cellIndexes: readonly number[], mask: number): number[] | null {
  const result: number[] = [];
  for (const index of cellIndexes) {
    const cell = getUnit(board, index);
    if (!cell.value && (cell.candidates & mask) !== 0) result.push(index);
  }
  return result.length ? result : null;
}

// Pointing pairs: a digit is confined to one row/column of a box
function findPointingPairs(board: Board): { remove: readonly number[]; value: number } | null {
  for (const box of BOXES) {
    for (const { digit, mask } of candidatesToDigitMasks(board, box)) {
      const trueIndex = getUnit(box, lowestSetIndex(mask) ?? -1);
      const digitMask = indexToMask(digit);

      // Rows
      if (ROW_MASKS.some((m) => (mask & ~m) === 0)) {
        const rowRemovable = getUnit(ROW_OUTSIDE_BOX_OF, trueIndex);
        const removable = filterCellCandidates(board, rowRemovable, digitMask);
        if (removable) return { remove: removable, value: digit };
      }

      // Cols
      if (COL_MASKS.some((m) => (mask & ~m) === 0)) {
        const colRemovable = getUnit(COLUMN_OUTSIDE_BOX_OF, trueIndex);
        const removable = filterCellCandidates(board, colRemovable, digitMask);
        if (removable) return { remove: removable, value: digit };
      }
    }
  }
  return null;
}

export function solvePointingPairs(board: Board): Board | null {
  const solution = findPointingPairs(board);
  if (!solution) return null;
  const newBoard = [...board];
  const mask = indexToMask(solution.value);
  for (const index of solution.remove) newBoard[index] = removeCandidate(board, index, mask);
  return newBoard;
}

function findClaiming(board: Board): { remove: readonly number[]; value: number } | null {
  // Rows
  for (const row of ROWS) {
    for (const { digit, mask } of candidatesToDigitMasks(board, row)) {
      const trueIndex = getUnit(row, lowestSetIndex(mask) ?? -1);

      if (LINE_MASKS.some((m) => (mask & ~m) === 0)) {
        const rowRemovable = getUnit(BOX_OUTSIDE_ROW_OF, trueIndex);
        const digitMask = indexToMask(digit);
        const removable = filterCellCandidates(board, rowRemovable, digitMask);
        if (removable) return { remove: removable, value: digit };
      }
    }
  }

  // Cols
  for (const column of COLUMNS) {
    for (const { digit, mask } of candidatesToDigitMasks(board, column)) {
      const trueIndex = getUnit(column, lowestSetIndex(mask) ?? -1);

      if (LINE_MASKS.some((m) => (mask & ~m) === 0)) {
        const colRemovable = getUnit(BOX_OUTSIDE_COLUMN_OF, trueIndex);
        const digitMask = indexToMask(digit);
        const removable = filterCellCandidates(board, colRemovable, digitMask);
        if (removable) return { remove: removable, value: digit };
      }
    }
  }

  return null;
}

export function solveClaiming(board: Board): Board | null {
  const solution = findClaiming(board);
  if (!solution) return null;
  const newBoard = [...board];
  const mask = indexToMask(solution.value);
  for (const index of solution.remove) newBoard[index] = removeCandidate(board, index, mask);
  return newBoard;
}

function findNakedPair(board: Board): { house: readonly number[]; mask: number } | null {
  for (const house of HOUSES) {
    const maskCount: Record<number, number> = {};
    const eligible: number[] = [];
    const validCells: Cell[] = [];

    for (const index of house) {
      const cell = getUnit(board, index);
      if (cell.value) continue;
      validCells.push(cell);
      if (countSetBits(cell.candidates) === 2) {
        if (maskCount[cell.candidates]) {
          if (maskCount[cell.candidates] === 2) throw new IllegalStateError(IllegalStateError.Code.TOO_MANY_NAKED);
          maskCount[cell.candidates] = 2;
          eligible.push(cell.candidates);
        } else {
          maskCount[cell.candidates] = 1;
        }
      }
    }

    for (const mask of eligible) {
      for (const cell of validCells) {
        if (cell.candidates !== mask && (cell.candidates & mask) !== 0) return { house, mask };
      }
    }
  }

  return null;
}

export function solveNakedPair(board: Board): Board | null {
  const solution = findNakedPair(board);
  if (!solution) return null;
  const newBoard = [...board];
  for (const index of solution.house) {
    const cell = getUnit(board, index);
    if (cell.value) continue;
    // This check differs from removeCandidate, but sits in the middle of chain
    if (cell.candidates === solution.mask) continue;

    const newCandidates = cell.candidates & ~solution.mask;
    if (newCandidates === 0) throw new IllegalStateError(IllegalStateError.Code.NO_CANDIDATES);
    newBoard[index] = cell.candidates === newCandidates ? cell : { ...cell, candidates: newCandidates };
  }
  return newBoard;
}

function findHiddenPair(board: Board): { remove: number[]; mask: number } | null {
  for (const house of HOUSES) {
    const digitsOfMask: Record<number, number[]> = {};
    for (const { digit, mask } of candidatesToDigitMasks(board, house)) {
      if (countSetBits(mask) === 2) {
        const digits = digitsOfMask[mask];
        if (digits) {
          digits.push(digit);
        } else {
          digitsOfMask[mask] = [digit];
        }
      }
    }

    for (const [mask, digits] of Object.entries(digitsOfMask)) {
      if (digits.length > 2) throw new IllegalStateError(IllegalStateError.Code.TOO_MANY_HIDDEN);
      if (digits.length !== 2) continue;
      const relativeIndexes = setBitIndices(Number(mask));
      const digitMask = digits.reduce((acc, v) => acc | indexToMask(v), 0);
      for (const index of relativeIndexes) {
        const cell = getUnit(board, house[index] ?? -1);
        if (cell.candidates !== digitMask) return { remove: relativeIndexes.map((i) => house[i] ?? -1), mask: digitMask };
      }
    }
  }

  return null;
}

export function solveHiddenPair(board: Board): Board | null {
  const solution = findHiddenPair(board);
  if (!solution) return null;
  const newBoard = [...board];
  for (const index of solution.remove) newBoard[index] = removeCandidate(board, index, ~solution.mask);
  return newBoard;
}
