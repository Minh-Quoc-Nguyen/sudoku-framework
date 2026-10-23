import { HOUSES } from "../../constants/cordinates.js";
import type { Board } from "../../types/board.type.js";
import { getUnit } from "../../utils/board.js";
import { findNakedSetsInHouse } from "./algorithms.house.js";

export function findNakedSets(board: Board, config: { size?: number; first?: boolean } = {}): { masks: number[]; house: (typeof HOUSES)[number] }[] | null {
  const results: { masks: number[]; house: (typeof HOUSES)[number] }[] = [];
  for (const house of HOUSES) {
    const result = findNakedSetsInHouse(board, house, config);
    if (result) {
      results.push({ masks: result, house });
      if (config.first) return results;
    }
  }
  return results.length ? results : null;
}

export function solveNakedSets(board: Board, config: { size?: number; first?: boolean } = {}): Board | null {
  const results = findNakedSets(board, config);
  if (!results) return null;
  const newBoard = [...board];
  for (const { masks, house } of results) {
    for (const index of house) {
      const cell = getUnit(newBoard, index);
      if (cell.value) continue;
      let toRemove = 0;
      for (const mask of masks) {
        // Member of the mask
        if ((cell.candidates & ~mask) === 0) continue;
        toRemove |= mask;
      }
      if (toRemove) {
        const newCandidates = cell.candidates & ~toRemove;
        newBoard[index] = cell.candidates === newCandidates ? cell : { ...cell, candidates: newCandidates };
      }
    }
  }
  return newBoard;
}
