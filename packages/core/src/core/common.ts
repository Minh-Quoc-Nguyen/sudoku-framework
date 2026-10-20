import type { Board, Cell } from "../types/board.type.js";

export function getCell(board: Board, idx: number): Cell {
  const cell = board[idx];
  if (!cell) throw new RangeError(`Cell is falsy with index ${idx.toString()}`);
  return cell;
}
