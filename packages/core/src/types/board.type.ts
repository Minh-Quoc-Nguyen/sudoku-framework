export interface Cell {
  value: number | null;
  // Bitmask for bitwise operations
  candidates: number;
}

export type Board = Cell[];
