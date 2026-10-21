import type { Board } from "../types/board.type.js";
import type { Algorithm } from "../types/solver.type.js";
import { BOXES, COLUMNS, HOUSES, PEERS, ROWS } from "../constants/cordinates.js";
import { indexToMask, maskToIndex } from "../utils/bitwise.js";
import { getCell, sanitizeCandidates } from "./common.js";

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
  let newBoard = [...board];
  const simpleFinish = (modification: SimpleModification, alg: Algorithm) => {
    // Shallow copy
    const mask = indexToMask(modification.value);

    // Modify cell
    newBoard[modification.index] = { ...getCell(newBoard, modification.index), value: modification.value, candidates: mask };

    // Modify peers
    const peers = PEERS[modification.index];
    if (!peers) throw new RangeError(`Peers is falsy with index ${modification.index.toString()}`);

    for (const peer of peers) {
      const cell = getCell(newBoard, peer);
      newBoard[peer] = { ...cell, candidates: cell.candidates & ~mask };
    }

    return { board: newBoard, alg };
  };

  // Rebuild regardless if explicitly set
  if (candidates === "rebuild") newBoard = sanitizeCandidates(newBoard, true);

  const fullHouse = solveFullHouse(newBoard);
  if (fullHouse) return simpleFinish(fullHouse, "FullHouse");

  // Sanitize obvious candidates, ready for higher algs
  if (candidates !== "rebuild") newBoard = candidates === "trust" ? newBoard : sanitizeCandidates(newBoard);

  const hiddenSingleBox = solveHiddenSingleBox(newBoard);
  if (hiddenSingleBox) return simpleFinish(hiddenSingleBox, "HiddenSingleBox");

  const hiddenSingleLine = solveHiddenSingleLine(newBoard);
  if (hiddenSingleLine) return simpleFinish(hiddenSingleLine, "HiddenSingleLine");

  const nakedSingle = solveNakedSingle(newBoard);
  if (nakedSingle) return simpleFinish(nakedSingle, "NakedSingle");

  // No solution
  return null;
}

// FullHouse: a house with exactly one empty cell -> missing digit = 45 - sum of filled
function solveFullHouse(board: Board): SimpleModification | null {
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

// Hidden single: Within a unit, a value only appear as a candidate once
function solveHiddenSingleUnit(board: Board, units: readonly (readonly number[])[]): SimpleModification | null {
  for (const unit of units) {
    // seenOnce: digits that are a candidate in >= 1 cell
    // seenTwice: digits that are a candidate in >= 2 cells
    let seenOnce = 0;
    let seenTwice = 0;

    for (const idx of unit) {
      const cell = getCell(board, idx);
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
    for (const idx of unit) {
      const cell = getCell(board, idx);
      if (cell.value === null && (cell.candidates & bit) !== 0) return { index: idx, value };
    }
  }

  return null;
}

function solveHiddenSingleBox(board: Board): SimpleModification | null {
  return solveHiddenSingleUnit(board, BOXES);
}

function solveHiddenSingleLine(board: Board): SimpleModification | null {
  return solveHiddenSingleUnit(board, [...ROWS, ...COLUMNS]);
}

// Naked single: Cell only has one candidate
function solveNakedSingle(board: Board): SimpleModification | null {
  for (let i = 0; i < 81; i++) {
    const cell = getCell(board, i);
    if (cell.value) continue;
    const value = maskToIndex(cell.candidates);
    if (value) return { index: i, value };
  }
  return null;
}
