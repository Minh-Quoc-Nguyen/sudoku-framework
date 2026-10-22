import type { Board, Cell } from "../types/board.type.js";
import type { Algorithm } from "../types/solver.type.js";
import { BOXES, COLUMN_OUTSIDE_BOX_OF, HOUSES, LINES, PEERS, ROW_OUTSIDE_BOX_OF } from "../constants/cordinates.js";
import { indexToMask, isBitSet, lowestSetIndex, maskToIndex } from "../utils/bitwise.js";
import { getCell, getUnit, removeCandidate, sanitizeCandidates } from "./common.js";
import { COL_MASKS, FULL_CANDIDATE_MASK, ROW_MASKS } from "../constants/bitwise.js";

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
  // The solvers create a shallow board copy, therefore solveStep does not need to repeat this work
  let newBoard = candidates === "rebuild" ? sanitizeCandidates(board, true) : board;

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
  const newBoard = [...board];
  const cell = getCell(newBoard, modification.index);
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
      const cell = getCell(board, cellIndex);
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

function solveFullHouse(board: Board): Board | null {
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
      const cell = getCell(board, index);
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

// Pointing pairs helper
function filterCellCandidates(board: Board, cellIndexes: readonly number[], mask: number): number[] | null {
  const result: number[] = [];
  for (const index of cellIndexes) {
    const cell = getCell(board, index);
    if (!cell.value && (cell.candidates & mask) !== 0) result.push(index);
  }
  return result.length ? result : null;
}

// Pointing pairs: a digit is confined to one row/column of a box
function findPointingPairs(board: Board): { remove: readonly number[]; value: number } | null {
  for (const box of BOXES) {
    // If a digit already appears as a solved value, stop checking it
    let eligible = FULL_CANDIDATE_MASK;
    const candidates: number[] = [];
    for (const index of box) {
      const cell = getCell(board, index);
      if (cell.value) {
        eligible &= ~indexToMask(cell.value);
        candidates.push(0);
      } else {
        candidates.push(cell.candidates);
      }
    }

    for (let i = 1; i <= 9; i++) {
      if (!isBitSet(eligible, i)) continue;
      const digitMask = indexToMask(i);
      const positionMask = candidates.reduce((mask, candidate, j) => ((candidate & digitMask) !== 0 ? mask | (1 << j) : mask), 0);
      const trueIndex = getUnit(box, lowestSetIndex(positionMask) ?? -1);

      // Rows
      const rowRemovable = getUnit(ROW_OUTSIDE_BOX_OF, trueIndex);
      if (ROW_MASKS.some((m) => (positionMask & ~m) === 0)) {
        const removable = filterCellCandidates(board, rowRemovable, digitMask);
        if (removable) return { remove: removable, value: i };
      }

      // Cols
      const colRemovable = getUnit(COLUMN_OUTSIDE_BOX_OF, trueIndex);
      if (COL_MASKS.some((m) => (positionMask & ~m) === 0)) {
        const removable = filterCellCandidates(board, colRemovable, digitMask);
        if (removable) return { remove: removable, value: i };
      }
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
