import { FULL_MASK } from "../constants/bitwise.js";
import type { Board } from "../types/board.type.js";
import type { Algorithm } from "../types/solver.type.js";
import { BOXES, COLUMNS, HOUSES, PEERS, ROWS } from "../constants/cordinates.js";
import { digitToMask, maskToSingleDigit } from "../utils/bitwise.js";
import { getCell } from "./common.js";

interface SimpleModification {
  index: number;
  value: number;
}

export function solveAll(board: Board): Board {
  let solvingBoard = board;
  let solution = solveStep(solvingBoard, "rebuild");

  while (solution) {
    solvingBoard = solution.board;
    solution = solveStep(solvingBoard, "trust");
  }

  return solvingBoard;
}

export function solveStep(board: Board, candidates: "trust" | "sanitize" | "rebuild" = "sanitize"): { board: Board; alg: Algorithm } | null {
  const simpleFinish = (modification: SimpleModification, alg: Algorithm) => {
    // Shallow copy
    const newBoard = [...board];
    const mask = digitToMask(modification.value);

    // Modify cell
    newBoard[modification.index] = { ...getCell(board, modification.index), value: modification.value, candidates: mask };

    // Modify peers
    const peers = PEERS[modification.index];
    if (!peers) throw new RangeError(`Peers is falsy with index ${modification.index.toString()}`);

    for (const peer of peers) {
      const cell = getCell(newBoard, peer);
      newBoard[peer] = { ...cell, candidates: cell.candidates & ~mask };
    }

    return { board: newBoard, alg };
  };

  const fullHouse = solveFullHouse(board);
  if (fullHouse) return simpleFinish(fullHouse, "FullHouse");

  // Sanitize obvious candidates, ready for higher algs
  const trustedBoard = candidates === "trust" ? board : sanitizeCandidates(board, candidates === "rebuild");

  const hiddenSingleBox = solveHiddenSingleBox(trustedBoard);
  if (hiddenSingleBox) return simpleFinish(hiddenSingleBox, "HiddenSingleBox");

  const hiddenSingleLine = solveHiddenSingleLine(trustedBoard);
  if (hiddenSingleLine) return simpleFinish(hiddenSingleLine, "HiddenSingleLine");

  const nakedSingle = solveNakedSingle(trustedBoard);
  if (nakedSingle) return simpleFinish(nakedSingle, "NakedSingle");

  // No solution
  return null;
}

// Trust caller candidates if rebuild = false
function sanitizeCandidates(board: Board, rebuild = false): Board {
  const newBoard: Board = [];

  for (let i = 0; i < 81; i++) {
    // Get peer indices
    const peers = PEERS[i];
    if (!peers) throw new RangeError(`Peers is falsy with index ${i.toString()}`);

    // Extract cell data
    const cell = getCell(board, i);

    // Early exit for solved cells: reuse the original object if the mask is already normalized
    if (cell.value) {
      const solvedMask = digitToMask(cell.value);
      newBoard[i] = cell.candidates === solvedMask ? cell : { ...cell, candidates: solvedMask };
      continue;
    }

    let used = 0;
    for (const peer of peers) {
      const peerValue = board[peer]?.value ?? null;
      if (peerValue) {
        used |= digitToMask(peerValue);
      }
    }

    const candidates = (rebuild ? FULL_MASK : cell.candidates) & ~used;
    if (candidates === 0) throw new Error(`No candidates exists for cell index ${i.toString()}`);
    newBoard[i] = cell.candidates === candidates ? cell : { ...cell, candidates };
  }
  return newBoard;
}

// FullHouse: a box with exactly one empty cell -> missing digit = 45 - sum of filled
function solveFullHouse(board: Board): SimpleModification | null {
  boxLoop: for (const house of HOUSES) {
    let sum = 0;
    let missingIndex: number | null = null;

    for (const cellIndex of house) {
      const cellValue = board[cellIndex]?.value;
      if (cellValue) {
        sum += cellValue;
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

    // Second pass: find the single cell that holds this digit as a candidate
    for (const idx of unit) {
      const cell = getCell(board, idx);
      const value = maskToSingleDigit(bit);
      if (cell.value === null && value) return { index: idx, value };
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
    const value = maskToSingleDigit(cell.candidates);
    if (value) return { index: i, value };
  }
  return null;
}
