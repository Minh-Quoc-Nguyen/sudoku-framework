// Solvers exported by this are run per-house
import { IllegalStateError } from "../../classes/errors.js";
import type { HOUSES } from "../../constants/cordinates.js";
import type { Board, Cell } from "../../types/board.type.js";
import { countSetBits } from "../../utils/bitwise.js";
import { getUnit } from "../../utils/board.js";

/**
 * Find naked sets inside one house.
 *
 * A set counts as "usable" only when it can eliminate a candidate from some
 * other unsolved cell in the same house. Sets that eliminate nothing are
 * skipped.
 *
 * Results are union masks, not cell lists. The members are the cells whose
 * candidates fit inside the mask, so the caller can recover them if it needs
 * them. Keeping the finder mask-only makes it as cheap as possible: it marks a
 * union as soon as it is actionable and leaves everything else to the caller.
 *
 * - Default (no `size`): search every size k up to floor(unsolved / 2) and
 *   return every usable set found. Once cells are used by a set they leave the
 *   pool, so overlapping alternatives are not enumerated — the result is a
 *   maximal collection of disjoint minimal sets. The cap is a speed tradeoff
 *   for unattended full solves (stateful solvers, no user interaction), so it
 *   can miss a larger set in a small house, e.g. a usable triple when only 5
 *   cells are unsolved. Pass `size` to force a size.
 * - `size: n`: return usable sets of size n only. Smaller sizes are still
 *   searched first, just to consume their cells, so a result can never
 *   contain a smaller set. Returned sets are therefore always minimal.
 * - `first: true`: stop at the first usable set and return it.
 * - Returns `null` when no usable set matches the request.
 * - Throws `IllegalStateError` when a found set's digits enclose more cells
 *   than the set can hold (e.g. three cells sharing the same pair). This is
 *   only detected for sizes the search actually reaches.
 */
export function findNakedSetsInHouse(
  board: Board,
  house: (typeof HOUSES)[number],
  { size: n, first = false }: { size?: number; first?: boolean } = {},
): number[] | null {
  if (n !== undefined && (n < 2 || n > 4)) throw new RangeError(`findNakedSets does not support n=${n.toString()}`);

  const unsolvedCells: Cell[] = [];
  for (const index of house) {
    const cell = getUnit(board, index);
    if (!cell.value) unsolvedCells.push(cell);
  }

  const unsolved = unsolvedCells.length;
  const nClamp = n ?? 2; // smallest size we are allowed to report: n, or 2 when no size was asked for
  if (unsolved <= nClamp) return null;

  const nLimit: number = n ?? Math.max(Math.floor(unsolved / 2), 2);

  // Shared by the pair path and the larger-set path. We check against every
  // unsolved cell, not just the working pool, because cells already consumed
  // or pruned can still be elimination targets.
  const hasElimination = (unionMask: number): boolean => unsolvedCells.some((c) => (c.candidates & unionMask) !== 0 && (c.candidates & ~unionMask) !== 0);

  // A k-cell set can only absorb k digits. If more than k cells are confined
  // to those digits, the house can never be filled and the board is broken.
  // We only run this on unions the search actually produced, so it stays cheap.
  const assertNotOverfilled = (unionMask: number, size: number): void => {
    let enclosed = 0;
    for (const cell of unsolvedCells) if ((cell.candidates & ~unionMask) === 0) enclosed++;
    if (enclosed > size) throw new IllegalStateError(IllegalStateError.Code.ILLEGAL_NAKED_COUNT, enclosed);
  };

  // --- Collect candidates: bivalue cells are counted by mask, all other cells go straight into the pool ---
  let usableMasks: number[] = [];
  const bivalueCount = new Map<number, number>();

  for (const cell of unsolvedCells) {
    const bits = countSetBits(cell.candidates);
    if (bits < 2 || bits > nLimit) continue;
    if (bits === 2) {
      bivalueCount.set(cell.candidates, (bivalueCount.get(cell.candidates) ?? 0) + 1);
      continue; // decided below: a bivalue cell joins the pool only if it appears exactly once
    }
    usableMasks.push(cell.candidates);
  }

  const results: number[] = [];

  for (const [mask, count] of bivalueCount) {
    // Two digits may only be confined to exactly two cells. This also catches
    // the three-identical-bivalue-cells case, and is checked for lone bivalue
    // cells too because a naked single inside the mask would overfill it.
    assertNotOverfilled(mask, 2);

    // Seen once: keep it as a normal candidate for sets of size 3 or more.
    if (count === 1) {
      usableMasks.push(mask);
      continue;
    }
    // Seen twice: this is a naked pair. Keep it out of the pool so a larger
    // set can never absorb it, which keeps the results minimal. Report it only
    // when pairs were requested (no size given, or size 2).
    if (nClamp === 2 && hasElimination(mask)) {
      results.push(mask);
      if (first) return results;
    }
  }

  // If size 2 was the whole request, we are done.
  if (n === 2) return results.length > 0 ? results : null;

  // Pairs are finished. Sets now start at size 3, even when the caller asked
  // for quads: triples must be found and consumed first, otherwise a quad that
  // contains a triple could be reported as a non-minimal result.
  const SEARCH_START = 3;
  if (nLimit < SEARCH_START) return results.length > 0 ? results : null;

  // --- Prune until nothing changes ---
  // A mask with a candidate that no other mask shares cannot be part of a set,
  // so drop it. We still start at 3 when n = 4, because triples matter too.
  let twice = 0;
  let prevLength: number;
  do {
    if (usableMasks.length < SEARCH_START) return results.length > 0 ? results : null;
    prevLength = usableMasks.length;

    let once = 0;
    twice = 0;
    for (const m of usableMasks) {
      twice |= once & m;
      once |= m;
    }
    usableMasks = usableMasks.filter((m) => (m & ~twice) === 0);
  } while (usableMasks.length !== prevLength);

  if (countSetBits(twice) < SEARCH_START) return results.length > 0 ? results : null;

  // --- Recursive search: pick k pool cells whose candidates add up to exactly k values ---
  const findSubset = (pool: number[], k: number, start = 0, picked: number[] = [], union = 0): number[] | null => {
    if (picked.length === k) return countSetBits(union) === k ? picked : null;
    if (pool.length - start < k - picked.length) return null;

    for (let i = start; i < pool.length; i++) {
      const nextUnion = union | (pool[i] ?? 0);
      if (countSetBits(nextUnion) > k) continue;
      const found = findSubset(pool, k, i + 1, [...picked, i], nextUnion);
      if (found) return found;
    }
    return null;
  };

  // Smallest size first, so a larger set never swallows a smaller one.
  for (let k = SEARCH_START; k <= nLimit; k++) {
    // Sizes below n are searched only to consume their cells (e.g. triples when
    // n = 4). They are never reported and never checked for eliminations.
    const report = k >= nClamp;

    let indices: number[] | null;
    while (usableMasks.length >= k && (indices = findSubset(usableMasks, k)) !== null) {
      const picked = new Set(indices);

      // Build the union before filtering: the indices point into the current pool.
      const unionMask = indices.reduce((acc, i) => acc | (usableMasks[i] ?? 0), 0);

      usableMasks = usableMasks.filter((_, i) => !picked.has(i)); // a cell belongs to only one naked set

      // Runs for consume-only sizes too: a broken house should be caught no
      // matter which size exposed it.
      assertNotOverfilled(unionMask, k);

      if (!report) continue; // consume-only size: don't report, don't check eliminations

      if (hasElimination(unionMask)) {
        results.push(unionMask);
        if (first) return results;
      }
    }
  }

  return results.length > 0 ? results : null;
}
