import type { Board } from "../types/board.type.js";
import type { Algorithm } from "../types/solver.type.js";
import { BOXES, HOUSES, LINES } from "../constants/cordinates.js";
import { indexToMask, maskToIndex } from "../utils/bitwise.js";
import { getCell, getPeers, sanitizeCandidates } from "./common.js";

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
  for (const peer of peers) {
    const peerCell = getCell(newBoard, peer);
    const newCandidates = peerCell.candidates & ~mask;
    newBoard[peer] = peerCell.candidates === newCandidates ? peerCell : { ...peerCell, candidates: newCandidates };
  }

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
