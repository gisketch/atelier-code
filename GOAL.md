# Atelier Implementation Goal

This guide breaks the full implementation into practical phases using
[SPEC.md](SPEC.md) as the product and architecture contract and
[UI_REF.md](UI_REF.md) as the visual and interaction reference.

The implementation target is a local-first Sonata Orchestrator desktop app:

- Tauri v2 desktop shell.
- Rust for Tauri lifecycle and secure IPC commands.
- React, TypeScript, and Vite for the board UI.
- Bun and TypeScript for the orchestrator daemon.
- SQLite for durable local state.
- One target repository per board in v1.

## Product Contract

Build a desktop work board that turns local Kanban cards into isolated Codex
planning, implementation, verification, and PR-packet runs.

The app must own:

- Local board state, card state, runs, artifacts, logs, settings, and token totals.
- Per-card Git worktrees and branch lifecycle.
- Sonata workflow loading from the target repository.
- Plan-gated agent execution.
- Local PR packet generation for human review.
- Restart recovery from persisted state.

The app must not become:

- A hosted SaaS control plane.
- A general workflow engine.
- A GitHub CLI wrapper.
- An auto-merge bot by default.
- A UI that directly mutates target repository files.

## Implementation Phases

### Phase 0: Repository Bootstrap

Goal: create the project skeleton and lock the main implementation stack.

Deliverables:

- [x] Tauri v2 + React + TypeScript + Vite app skeleton.
- [x] Bun TypeScript daemon package.
- [x] Shared TypeScript types package or module boundary.
- [x] SQLite dependency and migration location.
- [x] Root scripts for development, linting, tests, and packaging.
- [x] Basic project documentation explaining the shell, UI, daemon, and store split.

Acceptance criteria:

- [x] `bun install` or the chosen install command succeeds.
- [x] React UI renders inside the Tauri shell.
- [x] Bun daemon can be started independently in development.
- [x] Tauri shell can start or connect to the daemon.
- [x] Repository has clear commands for app development and validation.

### Phase 1: Domain Model and SQLite Store

Goal: implement the durable model from the spec before building behavior on top.

Deliverables:

- [ ] SQLite schema for boards, cards, card state, runs, artifacts, settings, event
  history, token totals, retry entries, and live session snapshots.
- [ ] Migration runner.
- [ ] Store access layer with typed methods.
- [ ] Stable ID and normalization helpers.
- [ ] Seed or fixture data for local development.

Acceptance criteria:

- [ ] Board and card records round-trip through SQLite.
- [ ] State fields are constrained to valid values.
- [ ] Event history is append-only.
- [ ] Store tests cover creation, updates, ordering, and restart persistence.

### Phase 2: Workflow and Configuration Loading

Goal: make the target repository contract executable.

Deliverables:

- [ ] Workflow loader for `docs/orchestration/workflow.md`.
- [ ] YAML front matter parser and validator.
- [ ] Prompt template parser.
- [ ] Configuration resolution across defaults, workflow config, app settings, and
  operator overrides.
- [ ] Clear validation errors surfaced to the daemon and UI.

Acceptance criteria:

- [ ] Missing workflow files produce actionable errors.
- [ ] Invalid front matter is rejected before any run starts.
- [ ] Defaults are documented and test-covered.
- [ ] Prompt templates can be rendered with card, workflow, and run context.

### Phase 3: Workspace and Git Safety

Goal: safely create and reuse isolated workspaces for each card.

Deliverables:

- [ ] Workspace root containment checks.
- [ ] Deterministic workspace path mapping.
- [ ] Git worktree creation and reuse.
- [ ] Branch name generation using configured prefixes.
- [ ] Changed-file and branch-status reporting.
- [ ] Safety checks against destructive paths and invalid repository state.

Acceptance criteria:

- [ ] A card maps to one stable workspace path.
- [ ] Worktrees are preserved across app restart.
- [ ] Existing worktrees are validated before reuse.
- [ ] Workspace creation cannot escape the configured workspace root.
- [ ] Git status and changed files can be included in PR packets.

### Phase 4: Orchestration State Machine

Goal: enforce card eligibility, run lifecycle, retries, and plan gates.

Deliverables:

- [ ] Card state transition service.
- [ ] Run attempt lifecycle service.
- [ ] Plan, implementation, verification, and PR-packet run types.
- [ ] Dispatch eligibility checks.
- [ ] Retry and backoff handling.
- [ ] Reconciliation on startup.

Acceptance criteria:

- [ ] Invalid card transitions are rejected.
- [ ] Implementation is blocked until a plan is approved unless an explicit bypass
  policy is configured.
- [ ] Failed runs preserve logs and failure metadata.
- [ ] Restart recovery can reconcile active, stale, and completed runs.

### Phase 5: Local API and Tauri IPC

Goal: expose a stable local API between the Tauri shell, React UI, and daemon.

Deliverables:

- [ ] Rust commands for app lifecycle, daemon startup, and secure local IPC.
- [ ] Local API endpoints or command bridge for board, card, run, log, artifact, and
  settings operations.
- [ ] Typed client used by the React UI.
- [ ] Error envelope shared by UI and daemon.

Acceptance criteria:

- [ ] UI can list boards, cards, runs, logs, artifacts, and settings.
- [ ] UI can create/edit/reorder cards through the API.
- [ ] UI can start plan runs, approve plans, start implementation runs, and request
  PR packets through the API.
- [ ] Repository files are mutated only by orchestrator workflows, never directly by
  UI components.

### Phase 6: React Board UI

Goal: build the operator work surface described by the spec and styled by the UI
reference.

Deliverables:

- [ ] Board view with columns, cards, status badges, and run state.
- [ ] Card detail panel with description, acceptance criteria, plan approval, logs,
  artifacts, checks, token usage, and PR packet summary.
- [ ] Run history view.
- [ ] Settings view for target repository, workspace root, concurrency, workflow
  path, agent command, and safety posture.
- [ ] Log and artifact viewers.
- [ ] Empty, loading, error, blocked, running, failed, and recovered states.

Visual direction from [UI_REF.md](UI_REF.md):

- [ ] Desktop application feel, not a marketing website.
- [ ] Deep near-black background, ambient indigo lighting, subtle grid/noise depth.
- [ ] Precise 1px borders, restrained glass surfaces, clear focus rings.
- [ ] Dense, scannable operational UI.
- [ ] No nested cards or decorative page-section cards.
- [ ] Responsive layout that remains usable on smaller desktop windows.

Acceptance criteria:

- [ ] Operator can understand board state at a glance.
- [ ] Running work and blocked work are visually distinct.
- [ ] Logs and artifacts are readable without visual clutter.
- [ ] Keyboard focus states are visible.
- [ ] Text does not overflow cards, buttons, panels, or logs.

### Phase 7: Agent Runner Protocol

Goal: connect cards to coding-agent sessions in isolated worktrees.

Deliverables:

- [ ] Prompt construction from card data, workflow template, Sonata context, and
  approved plan artifacts.
- [ ] Agent launch contract for the configured Codex app-server client.
- [ ] Event stream parser.
- [ ] Token accounting.
- [ ] Runtime event persistence.
- [ ] User-input and approval policy enforcement.

Acceptance criteria:

- [ ] Plan runs create plan artifacts.
- [ ] Implementation runs consume approved plan artifacts.
- [ ] Verification runs execute configured checks.
- [ ] Agent events stream into the UI and persist in SQLite.
- [ ] Token totals are visible at card, run, and board levels.

### Phase 8: Sonata Context and Artifact Writing

Goal: preserve Sonata process as repository-owned execution context.

Deliverables:

- [ ] Context loader starting from `AGENTS.md`.
- [ ] Progressive disclosure for `docs/quality.md`, `docs/architecture/`, and
  `docs/exec-plans/`.
- [ ] Plan artifact writer.
- [ ] Verification artifact writer.
- [ ] Optional repository mirroring based on workflow config.

Acceptance criteria:

- [ ] Missing optional context does not crash the run.
- [ ] Required context failures block the run with clear errors.
- [ ] Plan artifacts follow the spec format.
- [ ] Artifacts are linked from card and run history.

### Phase 9: Scheduling and Dispatch

Goal: support manual and automatic execution while respecting concurrency and
safety.

Deliverables:

- [ ] Manual dispatch.
- [ ] Automatic dispatch mode.
- [ ] Dispatch ordering.
- [ ] Configurable concurrency limits.
- [ ] Run queue visibility.
- [ ] Reconciliation loop for stale or interrupted work.

Acceptance criteria:

- [ ] Only eligible cards enter the queue.
- [ ] Concurrency limits are enforced.
- [ ] Dispatch order is deterministic.
- [ ] Paused or blocked cards are skipped with visible reasons.

### Phase 10: PR Packet Generation

Goal: produce a review-ready local handoff instead of auto-merging work.

Deliverables:

- [ ] PR packet generator with required fields from the spec.
- [ ] Changed files, branch, summary, checks, logs, risks, and handoff notes.
- [ ] Provider publishing abstraction for future GitHub integration.
- [ ] Local packet viewer in the UI.

Acceptance criteria:

- [ ] PR packet can be generated without GitHub CLI.
- [ ] Packet includes enough information for human review.
- [ ] Failed checks are visible and block "ready" status.
- [ ] Auto-merge remains unavailable by default.

### Phase 11: Observability, Failure Recovery, and Safety

Goal: make the app trustworthy during long-running local automation.

Deliverables:

- [ ] Structured logs.
- [ ] Event history.
- [ ] Runtime snapshots.
- [ ] Failure classification.
- [ ] Restart recovery.
- [ ] Filesystem safety checks.
- [ ] Hook safety policy.
- [ ] High-trust approval behavior only when explicitly configured.

Acceptance criteria:

- [ ] Every run has durable logs and events.
- [ ] The UI can explain why a card is blocked, running, failed, or ready.
- [ ] Restarted app instances recover board and run state.
- [ ] Dangerous paths, unsafe hooks, and invalid workspaces are rejected before work
  begins.

### Phase 12: Packaging and V1 Release Hardening

Goal: make the reference implementation shippable as a local desktop app.

Deliverables:

- [ ] Tauri packaging configuration.
- [ ] Bun daemon packaged or launched as a sidecar.
- [ ] Production SQLite path handling.
- [ ] App settings persistence.
- [ ] Release validation checklist.
- [ ] Smoke test profile against a real local repository.

Acceptance criteria:

- [ ] Packaged app launches cleanly.
- [ ] Packaged app can create a board for one local repository.
- [ ] Packaged app can create a card, run plan, approve plan, run implementation,
  run checks, and generate a PR packet.
- [ ] Logs and artifacts survive app restart.

## Cross-Phase Quality Gates

Every phase should maintain these gates:

- [ ] TypeScript type checks pass.
- [ ] Rust/Tauri checks pass once Tauri code exists.
- [ ] Store migrations are repeatable from an empty database.
- [ ] Unit tests cover state transitions and validation behavior.
- [ ] Integration tests cover the daemon, store, and local API boundaries.
- [ ] UI checks cover empty, loading, blocked, running, failed, and success states.
- [ ] Manual smoke tests use a disposable local target repository.

## UI Build Rules

Use [UI_REF.md](UI_REF.md) as the visual source of truth.

Implementation rules:

- Build the actual board as the first screen.
- Prioritize dense operational clarity over landing-page composition.
- Use icons for actions where a standard icon exists.
- Keep cards for actual cards, repeated items, and modals.
- Avoid nested cards and decorative wrapper panels.
- Use compact headings inside tool surfaces.
- Keep fixed-format elements stable with explicit dimensions or constraints.
- Preserve readable contrast for logs, metadata, and disabled states.
- Animate state changes subtly and quickly; never hide operational status behind
  decorative motion.

Core screens:

- Board.
- Card detail.
- Run history.
- Logs.
- Artifacts.
- PR packet.
- Settings.

Core UI states:

- Empty board.
- Missing workflow.
- Invalid workflow.
- Card blocked by plan gate.
- Run queued.
- Run active.
- Run awaiting approval.
- Run failed.
- PR packet ready.
- Restart recovered.

## V1 Definition of Done

V1 is complete when:

- The Tauri shell starts the app.
- The React board UI renders local cards.
- The Bun daemon owns orchestration state.
- SQLite persists boards, cards, runs, events, artifacts, settings, and token
  totals.
- One board maps to one repository.
- Workflow loading reads `docs/orchestration/workflow.md`.
- Sonata context loading reads `AGENTS.md` and `docs/quality.md` when present.
- Card state transitions are enforced.
- Plan gate blocks implementation until approval.
- Git worktree manager creates isolated worktrees.
- Agent runner launches in the per-card worktree.
- Token usage is recorded.
- Check results are recorded.
- PR packet is generated locally.
- Human review remains required before merge.

## Recommended Post-V1 Extensions

These are useful but should not block v1:

- GitHub provider API for PR creation.
- Browser verification evidence capture.
- External tracker import adapters.
- Multi-repository boards.
- Remote worker execution.
- Saved dashboard filters.

## Explicitly Deferred

Do not spend v1 time on:

- Hosted multi-tenant service.
- Distributed worker fleet.
- Auto-merge as the default workflow.
- Replacing Git providers.
- External issue tracker dependency in core.
