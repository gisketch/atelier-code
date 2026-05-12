# Architecture

## Current Shape

- Kind: existing project
- Stack: Tauri v2 shell, Rust IPC, React/TypeScript/Vite UI, Bun TypeScript daemon, SQLite store.

## Default Layer Direction

Use this direction until the project chooses stronger boundaries:

```text
types -> config -> data -> service -> runtime -> interface
```

Cross-cutting concerns should enter through explicit provider interfaces.

## Application Skeleton

- [src](../../src): UI, daemon, and shared TypeScript contracts.
- [src-tauri](../../src-tauri): Tauri v2 Rust shell and app packaging configuration.
- [tests](../../tests): tests and fixtures placeholder.
- [config](../../config): local config examples placeholder.

## Runtime Boundaries

- Tauri owns desktop lifecycle and secure IPC commands.
- React renders the local board and calls typed UI/API boundaries.
- Bun owns orchestration state, scheduling, daemon routes, and SQLite access.
- SQLite persists durable board state under the configured app data path in later phases.

## Boundary Rule

If a dependency direction matters, document it here, then enforce it with checks when possible.
