# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build System

This is a Bun workspace monorepo using Turborepo with three projects:

- **types/** (`@cs124/ace-recorder-types`) - Runtime type definitions using `runtypes`
- **lib/** (`@cs124/ace-recorder`) - Main library, depends on types
- **demo/** (`demo`) - Next.js demo app, depends on lib

## Common Commands

```bash
bun install          # Install dependencies
bun run build        # Build all projects (via turbo)
bun run check        # Lint + type-check all projects, then format
bun run lint         # oxlint all projects
bun run tsc          # Type-check all projects
bun run format       # Biome (ts/tsx/js/json/css) + Prettier (md/yaml)
bun run format:check # Check formatting without writing
bun run clean        # Clean all build artifacts
bun run ncu          # Check for dependency updates
bun run ncu:apply    # Apply dependency updates

# Per-project (run from types/, lib/, or demo/):
bun run build        # TypeScript compilation (or next build for demo)
bun run lint         # oxlint
bun run tsc          # Type-check without emitting
bun run clean        # Clean build output

# Demo app development:
bun run dev          # next dev (from demo/)
```

## Versioning

Uses date-based versioning: `YYYY.M.MINOR` (e.g., `2026.2.0`).

## Architecture

The library records and replays Ace code editor sessions with synchronized audio. The key components form a layered
hierarchy:

**Recording/Replay primitives:**

- `AceRecorder` - Captures editor events (deltas, selections, cursor, scroll, window size) as timestamped `AceRecord`
  entries
- `AcePlayer` - Replays recorded editor state changes with animation
- `AceStreamer` - Streams editor events in real-time
- `AudioRecorder` / `AudioRecordReplayer` - Browser audio recording and playback

**Coordination layer:**

- `AceRecordReplayer` - Manages recording and replay lifecycle for a single Ace editor session
- `AceMultiRecordReplayer` - The same for several editors at once
- `SyncedRecordReplayer` - Shared base that keeps an Ace replayer in step with audio. Audio is the clock; Ace follows
  its play, pause, seek and stall events
- `RecordReplayer` / `MultiRecordReplayer` - Thin `SyncedRecordReplayer` subclasses for one editor or several

**Type system (`types/src/index.ts`):**

- All data types are defined as both `runtypes` validators (for runtime checking) and TypeScript types via `Static<>`
- `AceRecord` is a union of: Complete, Delta, SelectionChange, CursorChange, ScrollChange, WindowSizeChange,
  ExternalChange
- `AceTrace` wraps a sequence of `AceRecord`s with metadata (duration, startTime, sessionInfo)
- `IRecordReplayer` defines the shared interface with states: "paused" | "playing" | "recording"

**Patterns:**

- Event-driven via `tiny-typed-emitter`
- State machine pattern for record/play/pause lifecycle
- Time synchronization between audio and editor with 0.1s tolerance
- `AceRecorder` takes a Complete snapshot every `completeInterval` ms (default 1000). Seeking jumps to the last Complete
  and replays forward, so the interval bounds seek work, not accuracy. `completeCount` (default 0 = off) adds a snapshot
  every N records
- Every replayer has `add`/`remove` pairs for state and event listeners

## Testing

- `bun run test` runs unit tests (bun:test with happy-dom). `bun run tsc` type-checks tests too, via each package's
  `tsconfig.test.json`
- Test mocks in `lib/test/fixtures/` mirror real Ace and HTMLAudioElement behavior; check ace-builds before changing
  them
- Use `useFakeTimers()` / `restoreRealTimers()` from `lib/test/fixtures/timers.ts`, never `jest.useRealTimers()`
  directly: a Bun 1.4.2 bug can otherwise leave `setTimeout` permanently unfaked
- `*.regression.test.ts` files pin bugs fixed in 2026.10.0
- `bun run test:e2e` runs Playwright against the demo's static export (built by turbo, served by `e2e/serve.ts`). A
  shared fixture fails any test that logs a console error or page error

## Code Style

- No semicolons, 120 char line width
- **Biome** formats and organizes imports for `.ts/.tsx/.js/.mjs/.json/.css`. Config: `biome.json`. Its linter is
  disabled.
- **Prettier** handles only what Biome cannot: `.md/.mdx/.yaml/.yml`, with prose wrap always. Config:
  `prettier.config.js`.
- **oxlint** lints. Config: `.oxlintrc.json` at the root, shared by all packages.
- **TypeScript 7** (the native compiler). It ships no JS compiler API, which is why typescript-eslint was replaced by
  oxlint.
- `lib/src/index.ts` opts out of import sorting with a `biome-ignore-all` comment; keep its order as written.
