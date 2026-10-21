export function indexToMask(digit: number): number {
  return 1 << digit;
}

export function maskToIndex(mask: number): number | null {
  // If mask as 0 or has more than 1 bits set, return null (use isBitSet to probe instead)
  if (mask === 0 || (mask & (mask - 1)) !== 0) return null;
  return 31 - Math.clz32(mask);
}

export function isBitSet(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

export function fullMask(n: number): number {
  if (n < 0 || n > 31) throw new RangeError("n must be between 0 and 31");
  return n === 0 ? 0 : -1 >>> (32 - n);
}

// Overloads: the return type is narrowed by the `output` argument,
// so callers get boolean[] or number[] without casting.
export function resolveCandidates(mask: number, output: "boolean"): boolean[];
export function resolveCandidates(mask: number, output: "number"): number[];
export function resolveCandidates(mask: number, output: "boolean" | "number"): boolean[] | number[] {
  const bools: boolean[] = [];
  const numbers: number[] = [];
  for (let i = 0; i < 9; i++) {
    const isSet = isBitSet(mask, i + 1);
    bools[i] = isSet;
    if (isSet) numbers.push(i + 1);
  }

  return output === "boolean" ? bools : numbers;
}
