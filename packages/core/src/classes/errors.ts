const ILLEGAL_STATE_MESSAGES = {
  NO_CANDIDATES: "No candidates exists for at least one cell!",
  TOO_MANY_NAKED: "Too many cells found for naked candidate check!",
  TOO_MANY_HIDDEN: "Too many hidden values in too little cells for hidden candidate check!",
} as const;

export type IllegalStateCode = keyof typeof ILLEGAL_STATE_MESSAGES;

export class IllegalStateError extends Error {
  static readonly Code = Object.fromEntries(Object.keys(ILLEGAL_STATE_MESSAGES).map((k) => [k, k])) as { [K in IllegalStateCode]: K };

  constructor(public readonly code: IllegalStateCode) {
    super(ILLEGAL_STATE_MESSAGES[code]);
    this.name = "IllegalStateError"; // readable in stack traces / logs
  }
}
