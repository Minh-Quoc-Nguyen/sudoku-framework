// Solvers exported by this are ran per-house

import { IllegalStateError } from "../../classes/errors.js";
import { HOUSE_SIZE } from "../../constants/board.js";
import type { HOUSES } from "../../constants/cordinates.js";
import type { Board } from "../../types/board.type.js";
import { countSetBits } from "../../utils/bitwise.js";
import { getUnit } from "../../utils/board.js";

export function findNakedSetsInHouse(board: Board, house: (typeof HOUSES)[number], n: number): { members: number[]; unionMask: number }[] | null {
  if (n < 3 || n > 4) throw new RangeError(`findNakedSets does not support n=${n.toString()}`);

  let once = 0;
  let twice = 0;
  let unsolved = HOUSE_SIZE;
  const validCandidates: { candidates: number; index: number }[] = [];
  const rawMasks: number[] = [];

  // Cell data collection
  for (const index of house) {
    const cell = getUnit(board, index);
    if (cell.value) {
      unsolved--;
      // Can't produce useful results, early return
      if (unsolved <= n) return null;
      continue;
    }
    const setBitCount = countSetBits(cell.candidates);
    // Store to reuse
    validCandidates.push({ candidates: cell.candidates, index });
    // Has 1 candidate: naked single, has more than n: can't be naked
    if (setBitCount < 2 || setBitCount > n) continue;
    rawMasks.push(cell.candidates);
    twice |= once & cell.candidates;
    once |= cell.candidates;
  }

  if (rawMasks.length < n) return null;

  // Mask processing: every digit of a minimal set must appear in >= 2 eligible cells
  if (countSetBits(twice) < n) return null;
  const validCombos: { members: number[]; unionMask: number }[] = [];

  const checkNestedPairs = n >= 4;
  for (let combo = twice; combo !== 0; combo = (combo - 1) & twice) {
    if (countSetBits(combo) !== n) continue;

    let contained = 0;
    let innerOnce = 0;
    let innerTwice = 0;
    let pairsSeen: number[] | null = null;
    let hasNestedPair = false;

    for (const mask of rawMasks) {
      if ((mask & ~combo) !== 0) continue;
      if (++contained > n) throw new IllegalStateError(IllegalStateError.Code.ILLEGAL_NAKED_COUNT, contained);
      innerTwice |= innerOnce & mask;
      innerOnce |= mask;

      // Two identical pair cells inside a quad means a smaller naked pair exists
      if (checkNestedPairs && !hasNestedPair && countSetBits(mask) === 2) {
        if (pairsSeen === null) pairsSeen = [mask];
        else if (pairsSeen.includes(mask)) hasNestedPair = true;
        else pairsSeen.push(mask);
      }
    }

    if (contained !== n || innerTwice !== combo) continue;
    if (hasNestedPair) continue;

    const members: number[] = [];
    let hasElimination = false;

    for (const { candidates, index } of validCandidates) {
      if ((candidates & ~combo) === 0) {
        members.push(index);
        // extra cell (e.g. naked single) inside a full n-set is an illegal board
        if (members.length > n) throw new IllegalStateError(IllegalStateError.Code.ILLEGAL_NAKED_COUNT, members.length);
      } else if ((candidates & combo) !== 0) {
        hasElimination = true;
      }
    }

    if (!hasElimination) continue;
    validCombos.push({ members, unionMask: combo });
  }

  return validCombos.length ? validCombos : null;
}
