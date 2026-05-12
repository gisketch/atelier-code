# Release Checklist

Use this before a V1 handoff or packaged build.

## Required Checks

- `bun install`
- `bun test`
- `bun run ui:build`
- `bun run check`
- `bash ./scripts/check-sonata.sh`
- `bash ./scripts/smoke-v1.sh --dry-run`
- `bun run build`

## Runtime Checks

- Start the daemon with `bun run daemon:dev`.
- Start the UI with `bun run ui:dev -- --port 1420`.
- Confirm `http://127.0.0.1:17345/health` responds.
- Confirm the board UI renders and can refresh the daemon snapshot.
- Confirm app settings persist in SQLite through `/api/settings`.
- Confirm Windows bundles are produced under `src-tauri/target/release/bundle/`.

## V1 Smoke Path

- Create a disposable local Git repository.
- Create one board for that repository.
- Create one card.
- Start a plan run.
- Approve the plan artifact.
- Start implementation in a worktree.
- Record verification checks.
- Generate a local PR packet.
- Restart daemon and confirm board state, runs, logs, and artifacts are still present.

## Safety

- Auto-merge is unavailable by default.
- Provider publishing is disabled unless a future adapter is configured.
- High-trust approval behavior requires explicit workflow configuration.
- Artifact and worktree paths must stay under their configured roots.
