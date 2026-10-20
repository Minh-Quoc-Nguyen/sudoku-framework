export function digitToMask(digit: number): number {
  return 1 << (digit - 1);
}

export function maskToSingleDigit(mask: number): number | null {
  // If mask is not empty and has only one bit set, continue, else return null
  if (mask === 0 || (mask & (mask - 1)) !== 0) return null;
  return 32 - Math.clz32(mask);
}

// Overloads: the return type is narrowed by the `output` argument,
// so callers get boolean[] or number[] without casting.
export function resolveCandidates(mask: number, output: "boolean"): boolean[];
export function resolveCandidates(mask: number, output: "number"): number[];
export function resolveCandidates(mask: number, output: "boolean" | "number"): boolean[] | number[] {
  const bools: boolean[] = [];
  const numbers: number[] = [];
  for (let i = 0; i < 9; i++) {
    const isSet = (mask & (1 << i)) !== 0;
    bools[i] = isSet;
    if (isSet) numbers.push(i + 1);
  }

  return output === "boolean" ? bools : numbers;
}
