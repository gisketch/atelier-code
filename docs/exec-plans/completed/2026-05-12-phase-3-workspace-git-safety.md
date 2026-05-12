# Goal

Complete Phase 3: workspace and Git safety.

# Acceptance criteria

- A card maps to one stable workspace path.
- Workspaces stay contained under the configured workspace root.
- Target repo and base branch are validated before worktree creation.
- Branch names are deterministic from prefix, card identifier, and card title.
- Git branches and worktrees are created or reused safely.
- Existing worktrees are validated before reuse.
- Changed files and branch status are available for PR packets.
- Unsafe repository state is rejected when dirty base repos are not allowed.

# Context links

- `GOAL.md`
- `SPEC.md`
- `src/daemon/store/index.ts`
- `src/daemon/workflow/index.ts`

# Steps

- [x] Read Phase 3 contract.
- [x] Add workspace path and branch helpers.
- [x] Add Git safety/preflight helpers.
- [x] Add worktree creation/reuse.
- [x] Add branch status and changed-file reporting.
- [x] Add tests against real temp Git repositories.
- [x] Validate and commit.

# Validation

- `bun test`
- `bun run typecheck`
- `bun run ui:build`
- `bun run check`
- `bash ./scripts/check-sonata.sh`

# Decision log

- Use Git CLI through non-interactive `execFileSync`.
- Keep the module local-only and explicit about every Git command.
- Refuse paths that escape the workspace root before invoking Git.

# Progress log

- 2026-05-12: Started after committing Phase 2 checkpoint `fc78108`.
- 2026-05-12: Added workspace/Git safety module and real temp-repo tests.
- 2026-05-12: Passed `bun test`, `bun run typecheck`, `bun run ui:build`, `bun run check`, and `bash ./scripts/check-sonata.sh`.
