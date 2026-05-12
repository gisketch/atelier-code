# V1 Local Smoke Profile

This profile exercises the shippable local path without requiring GitHub CLI or a hosted service.

## Command

```bash
bash ./scripts/smoke-v1.sh
```

Use `--dry-run` when validating release wiring without creating a disposable Git repository:

```bash
bash ./scripts/smoke-v1.sh --dry-run
```

## Scope

- Disposable local Git repository.
- SQLite store under a temp path or production app data.
- Board, card, run, artifact, settings, event, and PR-packet paths.
- Human-review handoff only. No merge or publish step.

## Pass Criteria

- Store and API tests pass against the smoke database.
- Disposable repository initializes with a real commit.
- No external tracker, GitHub CLI, or cloud service is required.
