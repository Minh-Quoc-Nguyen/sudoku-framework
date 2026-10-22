import { COL_MASKS, ROW_MASKS } from "../../constants/bitwise.js";
import { BOXES, COLUMN_OUTSIDE_BOX_OF, HOUSES, LINES, PEERS, ROW_OUTSIDE_BOX_OF } from "../../constants/cordinates.js";
import type { Board, Cell } from "../../types/board.type.js";
import { indexToMask, lowestSetIndex, maskToIndex } from "../../utils/bitwise.js";
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
