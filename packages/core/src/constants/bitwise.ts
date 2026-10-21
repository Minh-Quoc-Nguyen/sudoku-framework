import { fullMask, indexToMask } from "../utils/bitwise.js";

export const FULL_SUDOKU_MASK = fullMask(10) & ~indexToMask(0); // All 9 candidates are true, bit 0 is set to 0
