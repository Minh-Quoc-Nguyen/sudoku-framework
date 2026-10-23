# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

`sudoku-framework` is a pnpm monorepo for a Sudoku engine.
Only `@sudoku/core` is implemented today;`packages/web` is an empty placeholders.

- **Runtime/tooling**: Node >= 22.13, pnpm >= 11 (`packageManager: pnpm@11.15.1`), ESM (`"type": "module"`).
- **Language**: TypeScript (ES2025, `NodeNext`), strict settings, no bundler.
- **Tests**: Vitest.
- **Lint/typecheck**: ESLint 10 + typescript-eslint (`strictTypeChecked`, `stylisticTypeChecked`), `tsc --noEmit`.
- **Unused-code check**: Knip.
- No README exists; this file is the primary orientation doc.

## Commands

Run from the repository root:

```bash
pnpm install          # install workspace deps
pnpm test             # vitest run in every package
pnpm typecheck        # tool configs + every package
pnpm lint             # eslint .
pnpm lint:fix         # eslint . --fix
pnpm build            # tsc build in every package
pnpm knip             # unused files/exports/deps
pnpm clean            # remove build output
```

Per-package (e.g. `packages/core`): `pnpm --filter @sudoku/core test`, `... typecheck`, `... build`.

## Repository layout

```
packages/core/src/
  index.ts                  # public API surface (only re-exports)
  core/
    solver/
      solver.ts             # solveStep(), solveAll() orchestrator
      algorithms.ts         # legacy flat board-wide find/solve pairs
      algorithms.house.ts   # unit-scoped finders (one row/column/box)
      algorithms.board.ts   # board-scoped wrappers and appliers
    generator.ts            # newBoard(): generated support code for testing the solver
  constants/
    cordinates.ts           # precomputed units: ROWS, COLUMNS, BOXES, LINES, HOUSES, PEERS, *_OF
    bitwise.ts              # candidate masks for rows/cols, FULL_CANDIDATE_MASK
    algorithms.ts           # ALGORITHM_SCORE registry + difficulty ordering
  types/                    # board, solver, and utility types
  classes/errors.ts         # IllegalStateError
  utils/
    bitwise.ts              # mask <-> bit-index helpers (tested in bitwise.test.ts)
    board.ts                # board/candidate helpers, accessors
```

`packages/*/dist` is build output and is gitignored.

## Domain model and invariants

- A `Board` is `Cell[]` of exactly **81** cells. `Cell = { value: number | null; candidates: number }`.
- **Indexing is 0-based and row-major**: `index = row * 9 + column`.
- **Candidate masks use bits 1..9 for digits 1..9**: `indexToMask(digit) = 1 << digit`. Bit 0 is reserved/normalized off. Do not shift by `digit - 1` in solver-facing code.
- A solved cell normally has `candidates === indexToMask(value)`; `sanitizeCandidates` enforces this.
- `candidates === 0` on an unsolved cell is an illegal state and throws `IllegalStateError` (`NO_CANDIDATES`).
- `ALGORITHM_SCORE` in `constants/algorithms.ts` is the single registry of algorithm names and difficulty scores; the `Algorithm` type is derived from its keys. Add new algorithms there.
- **Hot-path convention**: solvers mutate nothing. They take a `Board`, return a new `Board`, and reuse unchanged `Cell` objects. `applySimpleModification` shallow-copies the board array, replaces the solved cell, and removes the digit from peers.
- `solveStep` tries algorithms in order — FullHouse → HiddenSingleBox → HiddenSingleLine → NakedSingle → PointingPairs → Claiming → NakedPair → HiddenPair — and returns `null` when stuck. `solveAll` loops until `solveStep` returns `null`; it does **not** backtrack, so it may leave a partially solved board.
- Generation (`newBoard` in `core/generator.ts`) _does_ backtrack internally. It digs clues from a full solution while a solution counter preserves uniqueness for >= 25 hints; below that it transforms known 17-clue seed puzzles and pads them.
  - `generator.ts` is **generated support code**, not hand-maintained core logic. Its current purpose is to exercise and validate the solver by producing known-solution boards.
  - Once the solver is complete, the generator is intended to be the foundation for uniqueness checking and board difficulty rating. Treat it as a verification tool rather than the final product.
- Generator-internal grids are `Uint16Array` and use a **local** bit convention (`1 << (digit - 1)`) with `0` meaning empty. These masks never cross the public API; `toBoard` converts to the `Cell` representation.

## Solver structure (`core/solver/`)

Every algorithm is implemented as a **find/solve pair**, with orchestration in `core/solver/solver.ts`. New algorithm code is split by the unit it reasons over into `algorithms.<unit>.ts` files; current units are `house` (one row/column/box) and `board` (walks `HOUSES`/`PEERS`). `algorithms.ts` remains the legacy flat file for older board-wide pairs; move a pair into the new layout when you touch it, not as an unrelated mass rename.

| Pure finder | Applier | Deduction |
| --- | --- | --- |
| `findFullHouse(board)` | `solveFullHouse(board)` | The only empty cell in a house gets the missing digit (`45 - sum`). |
| `findHiddenSingleUnit(board, units)` | `solveHiddenSingleBox` / `solveHiddenSingleLine` | A digit has exactly one candidate cell in a unit. The shared finder takes the unit list (`BOXES` or `LINES`); the two wrappers bind it. |
| `findNakedSingle(board)` | `solveNakedSingle(board)` | An unsolved cell has exactly one candidate. |
| `findPointingPairs(board)` | `solvePointingPairs(board)` | A digit in a box is confined to one row/column, so remove it from the rest of that line. Returns `{ remove, value }` rather than a placement. |
| `findClaiming(board)` | `solveClaiming(board)` | A digit in a row/column is confined to one box, so remove it from the rest of that box. Returns `{ remove, value }` rather than a placement. |
| `findNakedSetsInHouse(board, house, config)` / `findNakedSets(board, config)` | `solveNakedSets(board, config)` | `n` cells in a house whose combined candidates are exactly `n` digits form a naked set; remove those digits from other cells in the house. The house finder returns union masks; the board finder walks `HOUSES`. `solveStep` wires `{ size: 2, first: true }` as `NakedPair`. |
| `findHiddenPair(board)` | `solveHiddenPair(board)` | Two digits are confined to the same two cells in a house; those cells cannot hold any other candidates. |

The current modular example is `findNakedSetsInHouse` in `algorithms.house.ts`, wrapped by `findNakedSets`/`solveNakedSets` in `algorithms.board.ts`.

Rules for the find/solve pattern:

- **Finders are pure.** `findX` scans the board, returns a description of the deduction, and `null` when the pattern is absent. It never builds a new board.
- **Split by search unit.** A unit finder (for example `findNakedSetsInHouse`) takes one house or unit list, does the cheapest local scan, and returns indices/masks rather than board copies. A board finder (`findNakedSets`) owns the loop over `HOUSES`/`PEERS` and is the stable entry point for a grader or hint UI. Apply functions live next to the board finder that produces their input.
- **Appliers are pure too.** `solveX(board)` calls its finder, applies the result, and returns a **new `Board`**, or `null` when there was nothing to apply. It never mutates the input board or its cells.
- **Placements** share `applySimpleModification(board, modification)`: it shallow-copies the array, sets the cell to `{ value, candidates: indexToMask(value) }`, and removes that digit from all peers via `removeCandidate`.
- **Eliminations** (like pointing pairs/claiming/naked sets) copy the array and call `removeCandidate` or directly update cells in the house. Do not let an elimination leave a cell with zero candidates; throw `IllegalStateError` instead.
- `SimpleModification` (`{ index, value }`) is the common result shape for single placements.
- `solveStep(board, { candidates })` is the orchestrator: it runs the algorithms in the order listed above and returns `{ board, alg }` for the first success, or `null`. `alg` is the `Algorithm` key used for scoring. Candidates can be `"trust"`, `"sanitize"`, or `"rebuild"`.
- `solveAll(board)` repeatedly calls `solveStep` starting with `candidates: "rebuild"`, then `candidates: "trust"`, and stops when it returns `null`. It does **not** backtrack, so it may leave a partially solved board.

### Algorithm file convention

- `algorithms.<unit>.ts` groups algorithms by the unit they search. `<unit>` is `house` for a single row/column/box and `board` for anything that walks `HOUSES`/`PEERS` and applies board-wide effects. Add a new unit only for a genuinely different search shape (for example `chain` or `fish`), not once per algorithm.
- A unit finder takes `(board, unit, config)`, returns a deduction description or `null`, and must not allocate a board copy. A board-level wrapper loops over the relevant units and is the stable API for a grader or hint UI.
- Appliers (`solveX`) live with the board-level finder that produces their input. They may import unit finders; unit finders must not import `algorithms.board.ts` or `solver.ts`.
- `algorithms.ts` is the legacy flat module. New algorithms go in the new layout. When editing an old pair, move it only if the change already touches both finder and applier; avoid leaving half a pair in each file.

### Adding an algorithm

1. Implement `findX` in the appropriate `algorithms.<unit>.ts`; keep it pure and return `null` when the pattern is absent.
2. Implement `solveX` beside the corresponding board-level finder; copy the board and reuse unchanged `Cell` objects.
3. Add the name to `ALGORITHM_SCORE` in `constants/algorithms.ts`; that object is the single source of truth for the `Algorithm` type.
4. Wire it into `solveStep` in difficulty order. Always pass explicit config (for example `size: 3`) when one algorithm family can report multiple names, so `alg` matches the deduction.
5. Add finder, applier, and where relevant `solveStep` tests; verify solver results against `newBoard(...).solution`.

## Grader (planned)

The grader will rate a puzzle by replaying deductions, not by re-scanning candidates on its own. Keep these contracts stable:

- Drive `solveStep` in a loop: once with `{ candidates: "rebuild" }`, then with `{ candidates: "trust" }`. This mirrors `solveAll` but preserves the per-step `alg`. Do not grade with `solveAll`, which discards the algorithm key.
- Aggregate `ALGORITHM_SCORE[alg]` and keep the step sequence for hints/explanations. Whether difficulty is a sum, max, or step count is a grader policy decision; `alg` is already the exact `Algorithm` key.
- Call board-level finders (`findX`) directly when the grader needs to detect or explain a pattern without applying it. Do not duplicate the house loops.
- Use `GeneratedBoard.solution` from `newBoard` to validate generated puzzles. The generator is a verification tool, not the grader.
- Intended home: `core/grader.ts` (not created yet). Re-export it from `src/index.ts` only if it becomes public API.

## Code conventions

- Use ESM imports with explicit `.js` extensions (`NodeNext`), even from `.ts` files.
- Use `import type` / separate type imports (`verbatimModuleSyntax`, `consistent-type-imports`).
- Exported functions need explicit return types (`explicit-module-boundary-types`).
- Prefer `readonly` arrays/params where values are not mutated; preserve the existing immutability style.
- Keep the **find/apply split** described in [Solver structure](#solver-structure-coresolvets): a pure `findX` returns a description of the deduction (or `null`), and `solveX` applies it. This supports scoring and step-by-step hints. Do not collapse these into one function.
- Throw `RangeError` for bad indices/lengths and `IllegalStateError` for contradictory boards; avoid plain `Error` for these cases.
- Follow the file layout: algorithm logic in `core/solver/algorithms.<unit>.ts` (legacy pairs may remain in `core/solver/algorithms.ts`), orchestration in `core/solver/solver.ts`, constants in `constants/`, generic helpers in `utils/`.
- Public API changes must be reflected in `src/index.ts`. Both `solveStep` and `solveAll` are exported from `index.ts`.

## Testing

- Vitest tests are colocated as `src/**/*.test.ts`; they are excluded from the build. Mirror the source scope: `algorithms.house.test.ts` for unit finders, `algorithms.board.test.ts` for board wrappers/appliers, and `solver.test.ts` for ordering and `alg` keys.
- Prefer table-driven `it.each` with explicit expected values (see `utils/bitwise.test.ts`).
- Add tests for any new bitwise helper, solver algorithm, or generator change. Verify solver results against `newBoard(...).solution`.
- Test finder and applier separately. Finders should be checked for `null` on absent patterns and for concrete masks/indices; appliers should be checked for board immutability, elimination effects, and `IllegalStateError` on contradictory input.
- `generator.ts` is currently the main source of known-solution boards for solver verification; broader uniqueness/difficulty checks will build on it later.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before finishing.

## Known gotchas

- `packages/core/tsconfig.json` is `noEmit`; `tsconfig.build.json` enables emit to `dist` and excludes tests.
- Root `tsconfig.json` only covers tool config files (`eslint.config.ts`); package typecheck is recursive.
- `knip.ts` only configures `packages/core`; new packages may need their own Knip workspace entries.
- Peer/unit constants are precomputed at module load; prefer them over recomputing row/column/box math.
- `solveNakedSets` accepts `size` 2..4. The default search (no `size`) mixes sizes and reports a maximal collection of disjoint sets; solver wiring must pass an explicit size so the returned `alg` name matches the deduction (`NakedPair`, `NakedTriple`, `NakedQuad`).
- `solveStep` returns after the first successful algorithm. A grader needing the applied step must loop `solveStep` itself; `solveAll` only returns the final board and loses the algorithm trace.
