# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build System

This is a Rush monorepo (v5.122.0) using pnpm (v9.0.6) with three projects:

- **types/** (`@cs124/ace-recorder-types`) - Runtime type definitions using `runtypes`
- **lib/** (`@cs124/ace-recorder`) - Main library, depends on types
- **demo/** (`demo`) - Next.js demo app, depends on lib

## Common Commands

```bash
rush update          # Install/update dependencies
rush build           # Build all projects
rush rebuild         # Clean rebuild all projects

# Per-project (run from types/, lib/, or demo/):
rushx check          # Run all checks: prettier, eslint, tsc, depcheck, build
rushx build          # TypeScript compilation
rushx eslint         # Lint
rushx prettier       # Format
rushx tsc            # Type-check without emitting
rushx watch          # Watch mode

# Full CI-style check:
./scripts/checkall.sh  # rush update + rebuild + check all projects
```

The demo app uses `next dev` for local development (`rushx start` in demo/).

## Versioning

Uses date-based versioning: `YYYY.M.MINOR` (e.g., `2024.4.0`).

## Architecture

The library records and replays Ace code editor sessions with synchronized audio. The key components form a layered hierarchy:

**Recording/Replay primitives:**
- `AceRecorder` - Captures editor events (deltas, selections, cursor, scroll, window size) as timestamped `AceRecord` entries
- `AcePlayer` - Replays recorded editor state changes with animation
- `AceStreamer` - Streams editor events in real-time
- `AudioRecorder` / `AudioRecordReplayer` - Browser audio recording and playback

**Coordination layer:**
- `AceRecordReplayer` - Manages recording and replay lifecycle for a single Ace editor session
- `RecordReplayer` - Synchronizes Ace editor replay with audio playback
- `MultiRecordReplayer` - Extends to support multiple concurrent editor sessions

**Type system (`types/src/index.ts`):**
- All data types are defined as both `runtypes` validators (for runtime checking) and TypeScript types via `Static<>`
- `AceRecord` is a union of: Complete, Delta, SelectionChange, CursorChange, ScrollChange, WindowSizeChange, ExternalChange
- `AceTrace` wraps a sequence of `AceRecord`s with metadata (duration, startTime, sessionInfo)
- `IRecordReplayer` defines the shared interface with states: "paused" | "playing" | "recording"

**Patterns:**
- Event-driven via `tiny-typed-emitter`
- State machine pattern for record/play/pause lifecycle
- Time synchronization between audio and editor with 0.1s tolerance

## Code Style

- No semicolons, 120 char line width, prose wrap always (`.prettierrc.yml`)
- ESLint with TypeScript ESLint and Prettier integration (flat config format `eslint.config.mjs`)
- `prettier-plugin-organize-imports` auto-sorts imports
