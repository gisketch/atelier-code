# Sonata Orchestrator Service Specification

Status: Draft v1 (language-agnostic core, TypeScript/Bun reference target)

Purpose: Define a local-first service that turns Kanban cards into isolated Codex planning,
implementation, verification, and PR-packet runs while preserving the Sonata process as the
repository-owned source of execution context.

## Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and
`OPTIONAL` in this document are to be interpreted as described in RFC 2119.

`Implementation-defined` means the behavior is part of the implementation contract, but this
specification does not prescribe one universal policy. Implementations MUST document the selected
behavior.

## 1. Problem Statement

Sonata Orchestrator is a local-first automation service and desktop work board. It continuously
reads work from its own Kanban board and card store, creates isolated Git workspaces for approved
cards, and runs coding-agent sessions for planning, implementation, verification, and PR handoff.

The service solves six operational problems:

- It replaces external tracker dependency with an owned Kanban board and durable local card store.
- It turns project work into a repeatable daemon workflow instead of ad hoc prompt sessions.
- It isolates coding-agent execution in per-card Git worktrees so commands run inside card-specific
  workspace directories.
- It uses the Sonata process as a first-class execution contract: `AGENTS.md`, `docs/quality.md`,
  `docs/architecture/`, and `docs/exec-plans/` are part of the orchestration path.
- It saves tokens by requiring a cheap plan gate before expensive implementation runs.
- It produces a PR packet for human review instead of auto-merging by default.

Important boundary:

- Sonata Orchestrator owns the local board, scheduling, run lifecycle, artifacts, and observability.
- Coding-agent sessions do the repository work inside isolated worktrees.
- A successful implementation run can end at `PR Ready`, not `Done`.
- Human review is required before merge in v1.

## 2. Goals and Non-Goals

### 2.1 Goals

- Provide a local desktop Kanban board backed by SQLite.
- Support one target repository per board in v1.
- Maintain a single authoritative orchestrator state for dispatch, retries, and reconciliation.
- Create deterministic per-card Git worktrees and preserve them across runs.
- Require an approved Sonata plan artifact before implementation unless an explicit operator bypass
  policy is configured.
- Generate and maintain Sonata execution-plan artifacts under `docs/exec-plans/`.
- Run Codex app-server sessions with compact Sonata/caveman prompts.
- Execute repository checks from `docs/quality.md` or workflow config.
- Generate PR packets containing branch, summary, changed files, checks, logs, risks, and handoff
  notes.
- Expose operator-visible observability through the board UI, structured logs, run history, token
  totals, artifacts, and check results.
- Recover from process restart using SQLite state and preserved workspaces.

### 2.2 Non-Goals

- Multi-tenant cloud control plane.
- Hosted team SaaS in v1.
- General-purpose workflow engine or distributed job scheduler.
- Auto-merge by default.
- Replacing Git hosting providers.
- Replacing Sonata project scaffolding.
- Depending on any external issue tracker in core v1.
- Requiring GitHub CLI.
- Prescribing one universal approval, sandbox, or operator-confirmation posture.

## 3. System Overview

### 3.1 Main Components

1. `Tauri Shell`
   - Owns desktop app lifecycle.
   - Hosts the React UI inside the system webview.
   - Provides secure local IPC to Rust commands.
   - Starts or connects to the Bun orchestrator daemon in the reference implementation.

2. `React Board UI`
   - Presents boards, columns, cards, run history, logs, artifacts, and PR packets.
   - Lets an operator approve plans and start runs.
   - Does not directly mutate repository files.

3. `Bun Orchestrator Daemon`
   - Owns scheduling, card dispatch, run state, retries, token accounting, and subprocess lifecycle.
   - Provides a local API to the Tauri shell.
   - Is the TypeScript/Bun reference target for v1.

4. `SQLite Store`
   - Persists boards, cards, card state, runs, artifacts, settings, token totals, and event history.
   - Is the local source of truth for board state.

5. `Workflow Loader`
   - Reads `docs/orchestration/workflow.md` from the target repository by default.
   - Parses YAML front matter and prompt body.
   - Returns `{config, prompt_template}`.

6. `Sonata Context Loader`
   - Reads repository-owned Sonata context files as needed.
   - Starts from `AGENTS.md` as the map.
   - Loads `docs/quality.md`, `docs/architecture/`, and `docs/exec-plans/` according to workflow and
     run type.

7. `Workspace Manager`
   - Maps cards to deterministic workspace paths.
   - Creates and validates per-card workspace directories.
   - Enforces workspace root containment.

8. `Git Worktree Manager`
   - Creates card branches using the configured branch prefix.
   - Creates or reuses Git worktrees under the configured workspace root.
   - Reports changed files and branch status for PR packets.

9. `Agent Runner`
   - Builds compact prompts from card data, workflow template, Sonata context, and approved plan
     artifacts.
   - Launches the coding-agent app-server client in the per-card worktree.
   - Streams agent events back to the orchestrator.

10. `Artifact Writer`
   - Writes or updates plan artifacts, verification artifacts, and PR packets.
   - Mirrors selected artifacts into the repository when the workflow requires it.

11. `Logging and Status Surface`
   - Emits structured runtime logs.
   - Drives board UI status from orchestrator state.

### 3.2 Abstraction Levels

Sonata Orchestrator is easiest to port when kept in these layers:

1. `Policy Layer`
   - Repository-owned `docs/orchestration/workflow.md`.
   - Sonata docs and process rules.
   - Plan-gate and PR-handoff rules.

2. `Configuration Layer`
   - App settings from SQLite.
   - Workflow front matter from the repository.
   - Environment variable resolution for credentials and paths.

3. `Board Layer`
   - Boards, columns, cards, priorities, dependencies, and human approvals.

4. `Coordination Layer`
   - Dispatch, state transitions, retries, cancellation, and reconciliation.

5. `Execution Layer`
   - Git worktrees, workspace hooks, Codex subprocesses, check commands, and artifacts.

6. `Integration Layer`
   - Git provider publishing adapters.
   - Future external tracker adapters.

7. `Observability Layer`
   - Logs, board status, run history, token totals, and generated packets.

### 3.3 External Dependencies

Core v1 dependencies:

- Local filesystem for repositories, workspaces, artifacts, logs, and SQLite.
- Git CLI or a Git library capable of worktree and branch operations.
- Coding-agent executable that supports the targeted Codex app-server mode.
- Host environment authentication for the coding agent.

Reference v1 dependencies:

- Tauri v2.
- Rust for the Tauri shell.
- React, TypeScript, and Vite for the UI.
- Bun for the daemon and TypeScript runtime.
- SQLite for durable board state.

Optional dependencies:

- Git hosting provider API for PR creation.
- Browser automation for verification evidence.
- External tracker adapters in later versions.

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 Board

A board represents one local Kanban workflow for one target repository.

Fields:

- `id` (string)
- `name` (string)
- `repo_path` (absolute path)
- `base_branch` (string)
- `workflow_path` (repo-relative path, default `docs/orchestration/workflow.md`)
- `workspace_root` (absolute path)
- `branch_prefix` (string, default `sonata/`)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 4.1.2 Card

Normalized work item used by scheduling, prompt rendering, and observability.

Fields:

- `id` (string)
- `identifier` (string)
  - Human-readable key generated by the board, for example `SON-12`.
- `title` (string)
- `description` (string)
- `acceptance_criteria` (list of strings)
- `priority` (integer or null)
  - Lower numbers are higher priority.
- `state` (string)
  - One of the configured board states.
- `labels` (list of strings)
  - Normalized to lowercase.
- `blocked_by` (list of card refs)
  - Each ref contains `id`, `identifier`, and `state`.
- `repo_path` (absolute path)
- `branch_name` (string or null)
- `plan_artifact_path` (repo-relative path or null)
- `pr_packet_path` (repo-relative path or null)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 4.1.3 Board State

Default states:

- `Inbox`
- `Ready`
- `Planning`
- `Plan Review`
- `Approved`
- `Implementing`
- `Verifying`
- `PR Ready`
- `Done`
- `Blocked`
- `Failed`

State names are displayed as authored, but comparisons use lowercase normalized names.

#### 4.1.4 Workflow Definition

Parsed repository workflow payload:

- `config` (map)
  - YAML front matter root object.
- `prompt_template` (string)
  - Markdown body after front matter, trimmed.

#### 4.1.5 Service Config

Typed runtime values derived from app settings, workflow front matter, and environment resolution.

Examples:

- board state mapping
- workspace root
- branch prefix
- plan gate mode
- concurrency limits
- Codex executable and timeouts
- check commands
- artifact locations
- PR packet template

#### 4.1.6 Workspace

Filesystem workspace assigned to one card.

Fields:

- `path` (absolute workspace path)
- `workspace_key` (sanitized card identifier)
- `branch_name` (string)
- `created_now` (boolean)
- `reused` (boolean)

#### 4.1.7 Run

One orchestrated execution for one card.

Fields:

- `id` (string)
- `board_id` (string)
- `card_id` (string)
- `run_type` (enum: `plan`, `implement`, `verify`, `pr_packet`)
- `attempt` (integer)
- `workspace_path` (absolute path or null)
- `branch_name` (string or null)
- `status` (enum)
- `started_at` (timestamp or null)
- `finished_at` (timestamp or null)
- `error` (string or null)
- `input_tokens` (integer)
- `output_tokens` (integer)
- `total_tokens` (integer)

#### 4.1.8 Plan Artifact

Approved implementation plan for one card.

Fields:

- `card_id`
- `path`
- `status` (`draft`, `approved`, `superseded`)
- `summary`
- `implementation_notes`
- `test_plan`
- `assumptions`
- `approved_by` (operator id or local username)
- `approved_at` (timestamp or null)

#### 4.1.9 PR Packet

Human-review handoff artifact.

Fields:

- `card_id`
- `path`
- `branch_name`
- `base_branch`
- `summary`
- `changed_files`
- `checks_run`
- `checks_failed`
- `checks_skipped`
- `artifacts`
- `risks`
- `operator_next_steps`
- `created_at`

#### 4.1.10 Live Session

State tracked while a coding-agent subprocess is running.

Fields:

- `session_id` (string, `<thread_id>-<turn_id>`)
- `thread_id` (string)
- `turn_id` (string)
- `codex_app_server_pid` (string or null)
- `last_codex_event` (string or null)
- `last_codex_timestamp` (timestamp or null)
- `last_codex_message` (summarized payload)
- `codex_input_tokens` (integer)
- `codex_output_tokens` (integer)
- `codex_total_tokens` (integer)
- `turn_count` (integer)

#### 4.1.11 Retry Entry

Scheduled retry state for a card run.

Fields:

- `card_id`
- `card_identifier`
- `run_type`
- `attempt`
- `due_at_ms` (monotonic clock timestamp)
- `timer_handle` (runtime-specific timer reference)
- `error` (string or null)

#### 4.1.12 Orchestrator Runtime State

Single authoritative in-memory state owned by the orchestrator.

Fields:

- `max_concurrent_runs`
- `running` (map `run_id -> running entry`)
- `claimed_cards` (set of card IDs)
- `retry_attempts` (map `run_id -> RetryEntry`)
- `completed_runs` (set of run IDs)
- `codex_totals`
- `codex_rate_limits`

### 4.2 Stable Identifiers and Normalization Rules

- `Board ID`
  - Use for SQLite relations and local API calls.
- `Card ID`
  - Use for internal map keys and SQLite relations.
- `Card Identifier`
  - Use for human-readable logs, branch names, and workspace naming.
- `Workspace Key`
  - Derive from card identifier by replacing any character not in `[A-Za-z0-9._-]` with `_`.
- `Branch Slug`
  - Derive from card title by lowercasing, replacing non-alphanumeric runs with `-`, trimming, and
    limiting to 48 characters.
- `Branch Name`
  - Default: `<branch_prefix><card_identifier-lower>-<branch_slug>`.
- `Normalized State`
  - Compare states after lowercase and trim.

## 5. Board and Card Store Specification

### 5.1 SQLite Store

SQLite is REQUIRED for core v1 board state.

The store MUST persist:

- boards
- cards
- card dependencies
- runs
- artifacts
- settings
- event log
- token totals
- check results

The store SHOULD be located under app data by default:

- `<app-data>/sonata-orchestrator/sonata-orchestrator.sqlite`

The implementation MUST support migration of the SQLite schema across versions.

### 5.2 Card State Transitions

Default allowed transitions:

- `Inbox` -> `Ready`, `Blocked`
- `Ready` -> `Planning`, `Blocked`
- `Planning` -> `Plan Review`, `Failed`
- `Plan Review` -> `Approved`, `Ready`, `Blocked`
- `Approved` -> `Implementing`, `Ready`, `Blocked`
- `Implementing` -> `Verifying`, `Failed`, `Blocked`
- `Verifying` -> `PR Ready`, `Implementing`, `Failed`
- `PR Ready` -> `Done`, `Implementing`, `Blocked`
- `Failed` -> `Ready`, `Planning`, `Implementing`
- `Blocked` -> `Ready`

Implementations MAY allow operator override transitions, but overrides MUST be logged.

### 5.3 Card Eligibility

A card is eligible for `plan` when:

- board is active
- card state is `Ready`
- card is not blocked by another non-terminal card
- no run is currently active for the card

A card is eligible for `implement` when:

- card state is `Approved`
- an approved plan artifact exists
- no run is currently active for the card
- workspace and Git preflight checks pass

A card is eligible for `verify` when:

- card state is `Verifying`
- implementation branch exists
- workspace exists

A card is eligible for `pr_packet` when:

- card state is `Verifying` or `PR Ready`
- branch and workspace exist
- implementation summary and check results are available

### 5.4 Plan Gate

The plan gate is REQUIRED in v1.

Rules:

- `implement` runs MUST NOT start without an approved plan artifact.
- Operator bypass MAY exist only when explicitly enabled in config.
- A bypass MUST be recorded in the event log and PR packet.
- Plan approval MUST record approver identity and timestamp.
- Superseded plans MUST remain readable for audit history.

## 6. Workflow Specification (Repository Contract)

### 6.1 File Discovery and Path Resolution

Workflow file path precedence:

1. Board setting `workflow_path`.
2. Default: `docs/orchestration/workflow.md` in the target repository.

Loader behavior:

- If the file cannot be read, return `missing_workflow_file`.
- The workflow file is expected to be repository-owned and version-controlled.
- Missing workflow file blocks agent dispatch for that board.

### 6.2 File Format

`docs/orchestration/workflow.md` is a Markdown file with OPTIONAL YAML front matter.

Parsing rules:

- If file starts with `---`, parse lines until the next `---` as YAML front matter.
- Remaining lines become the prompt body.
- If front matter is absent, treat the entire file as prompt body and use an empty config map.
- YAML front matter MUST decode to a map/object.
- Prompt body is trimmed before use.

Returned workflow object:

- `config`: front matter root object.
- `prompt_template`: trimmed Markdown body.

### 6.3 Front Matter Schema

Top-level keys:

- `board`
- `workspace`
- `git`
- `agent`
- `codex`
- `sonata`
- `pr_packet`
- `hooks`

Unknown keys SHOULD be ignored for forward compatibility.

#### 6.3.1 `board`

Fields:

- `states` (list of strings)
  - Default: the states in Section 4.1.3.
- `terminal_states` (list of strings)
  - Default: `Done`.
- `blocked_states` (list of strings)
  - Default: `Blocked`.
- `failed_states` (list of strings)
  - Default: `Failed`.

#### 6.3.2 `workspace`

Fields:

- `root` (path string or `$VAR`)
  - Default: `<app-data>/sonata-orchestrator/workspaces`.
- `reuse_existing` (boolean)
  - Default: `true`.
- `cleanup_on_done` (boolean)
  - Default: `false`.

#### 6.3.3 `git`

Fields:

- `base_branch` (string)
  - Default: board setting.
- `branch_prefix` (string)
  - Default: `sonata/`.
- `worktree_strategy` (string)
  - Default: `git_worktree`.
  - Core v1 supported value: `git_worktree`.
- `allow_dirty_base_repo` (boolean)
  - Default: `false`.
- `push_enabled` (boolean)
  - Default: `false`.

#### 6.3.4 `agent`

Fields:

- `max_concurrent_runs` (integer)
  - Default: `1`.
- `max_turns_plan` (integer)
  - Default: `1`.
- `max_turns_implement` (integer)
  - Default: `10`.
- `max_turns_verify` (integer)
  - Default: `4`.
- `max_retry_backoff_ms` (integer)
  - Default: `300000`.
- `require_plan_approval` (boolean)
  - Default: `true`.
- `allow_plan_bypass` (boolean)
  - Default: `false`.

#### 6.3.5 `codex`

Fields:

- `command` (string shell command)
  - Default: `codex app-server`.
- `approval_policy`
  - Codex app-server pass-through value.
- `thread_sandbox`
  - Codex app-server pass-through value.
- `turn_sandbox_policy`
  - Codex app-server pass-through value.
- `turn_timeout_ms` (integer)
  - Default: `3600000`.
- `read_timeout_ms` (integer)
  - Default: `5000`.
- `stall_timeout_ms` (integer)
  - Default: `300000`.

Implementors SHOULD inspect the targeted Codex app-server schema rather than hard-code Codex enum
values in this spec.

#### 6.3.6 `sonata`

Fields:

- `agents_map` (repo-relative path)
  - Default: `AGENTS.md`.
- `quality_doc` (repo-relative path)
  - Default: `docs/quality.md`.
- `architecture_root` (repo-relative path)
  - Default: `docs/architecture`.
- `active_plans_root` (repo-relative path)
  - Default: `docs/exec-plans/active`.
- `completed_plans_root` (repo-relative path)
  - Default: `docs/exec-plans/completed`.
- `prompt_mode` (string)
  - Default: `caveman-sonata`.
- `context_budget` (string)
  - Default: `compact`.

#### 6.3.7 `pr_packet`

Fields:

- `output_root` (repo-relative path)
  - Default: `docs/pr-packets`.
- `include_diffstat` (boolean)
  - Default: `true`.
- `include_check_logs` (boolean)
  - Default: `true`.
- `include_token_usage` (boolean)
  - Default: `true`.
- `publish_provider` (string or null)
  - Default: `null`.
  - Future supported values MAY include `github`.

#### 6.3.8 `hooks`

Fields:

- `after_worktree_create` (multiline shell script string, OPTIONAL)
- `before_run` (multiline shell script string, OPTIONAL)
- `after_run` (multiline shell script string, OPTIONAL)
- `before_cleanup` (multiline shell script string, OPTIONAL)
- `timeout_ms` (integer)
  - Default: `60000`.

### 6.4 Prompt Template Contract

The Markdown body of `docs/orchestration/workflow.md` is the per-card prompt template.

Rendering requirements:

- Use a strict template engine.
- Unknown variables MUST fail rendering.
- Unknown filters MUST fail rendering.

Template input variables:

- `board`
- `card`
- `run`
- `repo`
- `workflow`
- `sonata`
- `plan`
- `attempt`

Fallback behavior:

- If the workflow prompt body is empty, use the built-in Sonata prompt for the run type.
- Workflow read or parse failures MUST NOT silently fall back.

### 6.5 Validation and Error Surface

Error classes:

- `missing_workflow_file`
- `workflow_parse_error`
- `workflow_front_matter_not_a_map`
- `template_parse_error`
- `template_render_error`
- `missing_sonata_context`
- `missing_quality_doc`
- `missing_approved_plan`

Dispatch gating behavior:

- Workflow read or YAML errors block new dispatches for the affected board.
- Template errors fail only the affected run.
- Missing approved plan blocks `implement` runs.

## 7. Configuration Resolution

Configuration is resolved in this order:

1. Load board settings from SQLite.
2. Select target repository path from board settings.
3. Select workflow path from board settings or default.
4. Parse workflow front matter.
5. Apply built-in defaults.
6. Resolve `$VAR_NAME` indirection for supported fields.
7. Coerce and validate typed values.

Environment variables do not globally override workflow values. They are used only when a value
explicitly references them.

Path coercion:

- `~` is expanded.
- `$VAR` is expanded for path fields.
- Relative workflow paths resolve relative to the target repository root.
- Relative workspace paths resolve relative to app data unless explicitly documented otherwise.

Dynamic reload:

- The service SHOULD detect workflow file changes.
- Invalid reloads MUST NOT crash active runs.
- Reloaded config applies to future dispatch and future agent launches.
- In-flight agent sessions are not required to restart when config changes.

## 8. Orchestration State Machine

### 8.1 Card States

The orchestrator mutates card state only through explicit transitions.

Automatic transitions:

- `Ready` -> `Planning` when a plan run starts.
- `Planning` -> `Plan Review` when a plan artifact is created.
- `Planning` -> `Failed` when plan run fails.
- `Approved` -> `Implementing` when implementation starts.
- `Implementing` -> `Verifying` when implementation completes and checks are ready.
- `Implementing` -> `Failed` when implementation fails.
- `Verifying` -> `PR Ready` when verification and PR packet generation complete.
- `Verifying` -> `Failed` when verification fails.

Manual transitions:

- Plan approval moves `Plan Review` -> `Approved`.
- Human merge or accepted handoff moves `PR Ready` -> `Done`.
- Operator can move cards to `Blocked` or back to `Ready`.

### 8.2 Run Attempt Lifecycle

A run attempt transitions through these phases:

1. `Queued`
2. `PreparingWorkspace`
3. `LoadingSonataContext`
4. `BuildingPrompt`
5. `LaunchingAgentProcess`
6. `StreamingTurn`
7. `CollectingArtifacts`
8. `RunningChecks`
9. `WritingPacket`
10. `Succeeded`
11. `Failed`
12. `TimedOut`
13. `Stalled`
14. `Canceled`

### 8.3 Run Types

`plan`:

- Must not edit repository code.
- Produces a plan artifact under `docs/exec-plans/active/`.
- Moves the card to `Plan Review`.

`implement`:

- Requires an approved plan artifact unless bypass is explicitly enabled and used.
- Runs in an isolated Git worktree.
- Produces code changes, implementation notes, and check results.
- Moves the card to `Verifying` on success.

`verify`:

- Runs configured checks, smoke steps, or browser verification.
- Produces verification artifacts and updated check results.

`pr_packet`:

- Produces a human-review handoff packet.
- Does not require external PR publishing.
- Moves the card to `PR Ready` when complete.

### 8.4 Retry and Backoff

Retry entry creation:

- Cancel any existing retry timer for the same card and run type.
- Store `attempt`, `card_identifier`, `run_type`, `error`, `due_at_ms`, and timer handle.

Backoff formula:

- `delay = min(10000 * 2^(attempt - 1), agent.max_retry_backoff_ms)`

Retry behavior:

- Re-check card state before retry.
- Release claim if card is no longer eligible for that run type.
- Requeue if no concurrency slot is available.
- Fail permanently only when retry policy says the maximum attempts are exhausted.

## 9. Scheduling and Dispatch

### 9.1 Dispatch Modes

Supported v1 modes:

- `manual`
  - Operator starts each run from the board UI.
- `assisted`
  - Orchestrator can auto-start eligible next runs after human approvals.

Default: `manual`.

### 9.2 Dispatch Order

When multiple cards are eligible:

1. priority ascending
2. oldest `created_at`
3. identifier lexicographic tie-breaker

### 9.3 Concurrency

Global v1 default:

- `max_concurrent_runs = 1`

This default is intentional for token control and workspace safety.

Implementations MAY support higher concurrency after:

- workspace isolation tests pass
- token accounting is reliable
- board UI clearly shows concurrent active runs

### 9.4 Reconciliation

The orchestrator SHOULD reconcile active runs periodically and when the UI requests refresh.

Reconciliation checks:

- process still alive
- workspace still exists
- card still eligible for its current run
- stall timeout not exceeded
- branch still exists
- board state matches run state

If reconciliation finds an invalid active run, it MUST stop the run or mark it failed according to
the documented policy.

## 10. Workspace and Git Safety

### 10.1 Workspace Layout

Workspace root:

- `workspace.root`

Per-card workspace path:

- `<workspace.root>/<board_id>/<workspace_key>`

Workspace persistence:

- Workspaces are reused across runs for the same card by default.
- `Done` cards do not auto-delete workspaces unless `cleanup_on_done=true`.

### 10.2 Git Worktree Creation

Algorithm:

1. Validate target repo path is a Git repository.
2. Validate base branch exists.
3. Validate workspace root containment.
4. Derive workspace key and branch name.
5. Create branch from base branch if missing.
6. Create Git worktree at the per-card workspace path.
7. Run `after_worktree_create` hook if configured.

If branch already exists:

- Reuse it when it matches the card.
- Require operator confirmation or explicit config to reuse an unrelated branch name.

### 10.3 Safety Invariants

Mandatory:

- Coding-agent cwd MUST be the per-card workspace path.
- Workspace path MUST stay inside workspace root.
- Workspace directory names MUST be sanitized.
- Implementation runs MUST NOT execute in the base repository checkout.
- Destructive Git commands MUST NOT run automatically unless explicitly configured and logged.

Recommended:

- Refuse implementation if base repository has uncommitted changes and
  `git.allow_dirty_base_repo=false`.
- Keep worktree cleanup manual in v1.
- Store branch and worktree metadata in SQLite before launching the agent.

## 11. Agent Runner Protocol

This section defines Sonata Orchestrator responsibilities when integrating a Codex app-server. The
targeted Codex app-server protocol remains the source of truth for exact protocol schemas and
transport framing.

### 11.1 Launch Contract

Subprocess launch parameters:

- command: `codex.command`
- cwd: per-card workspace path
- transport: targeted Codex app-server transport

Default command:

- `codex app-server`

The runner MUST pass the per-card workspace as the working directory wherever the targeted protocol
accepts cwd.

### 11.2 Prompt Construction

The runner builds a compact prompt from:

- rendered workflow template
- card fields
- run type
- approved plan artifact, when applicable
- selected Sonata context
- previous run summary, when applicable

Prompt mode:

- Default is `caveman-sonata`.
- Prompts SHOULD be terse.
- Prompts SHOULD prefer references to repo-owned docs over pasted long context.
- Prompts MUST include acceptance criteria and plan-gate status.

### 11.3 Run-Type Requirements

Plan run:

- Instruct the agent not to mutate code.
- Instruct the agent to write only the plan artifact.
- If the agent needs implementation details, it should inspect files and summarize decisions in the
  plan.

Implementation run:

- Include approved plan artifact.
- Include exact branch and workspace path.
- Require check execution according to `docs/quality.md` when available.
- Require final implementation summary and changed file list.

Verification run:

- Include check commands and acceptance criteria.
- Prefer deterministic checks first.
- Add UI/browser evidence only when relevant.

PR-packet run:

- Include branch status, diffstat, checks, and artifacts.
- Must not merge.

### 11.4 Runtime Events

The app-server client emits structured events to the orchestrator:

- `session_started`
- `startup_failed`
- `turn_started`
- `turn_completed`
- `turn_failed`
- `turn_cancelled`
- `turn_input_required`
- `approval_requested`
- `approval_resolved`
- `usage_updated`
- `rate_limit_updated`
- `notification`
- `malformed`

Each event SHOULD include:

- timestamp
- board id
- card id
- run id
- session id, when available
- token usage, when available
- concise message

### 11.5 Approval and User Input Policy

Approval, sandbox, and user-input behavior is implementation-defined.

Requirements:

- Implementations MUST document the selected policy.
- Runs MUST NOT stall indefinitely waiting for user input.
- Approval requests MUST be surfaced in the UI, auto-resolved by documented policy, or treated as
  run failure.
- High-trust auto-approval MAY exist only when explicitly configured.

### 11.6 Token Accounting

Token accounting rules:

- Prefer absolute totals from Codex events when available.
- Track deltas from last reported totals to avoid double counting.
- Store per-run and board-level totals.
- Surface token totals in run history and PR packets when configured.

## 12. Sonata Context Assembly

### 12.1 Required Context

The implementation SHOULD load these files when present:

- `AGENTS.md`
- `docs/quality.md`
- `docs/architecture/index.md`
- active plan artifact for the card

Missing required files:

- Missing `AGENTS.md` SHOULD warn but not block all runs.
- Missing `docs/quality.md` SHOULD warn and require the run to report skipped checks.
- Missing approved plan MUST block implementation unless bypass is configured.

### 12.2 Progressive Disclosure

The runner SHOULD use progressive disclosure:

1. Read `AGENTS.md`.
2. Read only referenced docs needed for the card.
3. Read `docs/quality.md` before verification or handoff.
4. Read architecture docs only when relevant to touched subsystems.

### 12.3 Plan Artifact Format

Plan artifacts SHOULD contain:

- title
- card identifier and title
- summary
- key changes
- files or subsystems expected to change
- test plan
- assumptions
- explicit non-goals
- approval metadata

Plan artifacts MUST be sufficient for a later implementation run without re-deciding architecture.

## 13. PR Packet Specification

### 13.1 Purpose

A PR packet is the human-review handoff for one card. It can be used to create a pull request
manually or through a future provider adapter.

### 13.2 Required Fields

PR packet MUST include:

- card identifier and title
- branch name
- base branch
- summary
- acceptance criteria status
- changed files
- checks run
- checks failed
- checks skipped
- generated artifacts
- token usage when available
- residual risks
- operator next steps

### 13.3 Provider Publishing

Core v1 does not require external publishing.

If provider publishing is implemented:

- It MUST be an adapter.
- It MUST not be required for local PR-packet generation.
- It SHOULD support GitHub via API token rather than requiring `gh`.
- It MUST preserve human review before merge unless auto-merge is explicitly configured in a later
  version.

## 14. Local API and UI Surface

### 14.1 Local API

The reference implementation SHOULD expose a local API between Tauri and the Bun daemon.

Minimum operations:

- list boards
- create board
- update board settings
- list cards
- create card
- update card
- move card
- start run
- cancel run
- approve plan
- list runs
- stream run events
- open artifact
- generate PR packet

The API MUST be local-only in v1.

### 14.2 Board UI

The UI SHOULD provide:

- board selector
- Kanban columns
- card editor
- plan approval view
- run detail panel
- live event stream
- token totals
- check result view
- artifact links
- PR packet view

The UI MUST make plan-gate status visible before implementation starts.

## 15. Logging, Status, and Observability

### 15.1 Structured Logs

Required context fields:

- `board_id`
- `card_id`
- `card_identifier`
- `run_id`
- `run_type`
- `session_id`, when available

Logs SHOULD use stable `key=value` fields and concise messages.

### 15.2 Event History

The event history MUST persist enough information to debug:

- card transitions
- run start and stop
- retries
- approvals
- bypasses
- workspace creation
- Git branch/worktree actions
- check results
- agent failures

### 15.3 Runtime Snapshot

A runtime snapshot SHOULD include:

- active runs
- retry queue
- board counts by state
- token totals
- latest rate limits
- recent failures
- workspace paths
- branch names

## 16. Failure Model and Recovery

### 16.1 Failure Classes

1. `Config Failures`
   - Missing workflow file.
   - Invalid YAML.
   - Invalid workspace root.
   - Missing required board setting.

2. `SQLite Failures`
   - Migration failure.
   - Locked database.
   - Write failure.

3. `Git Failures`
   - Missing repository.
   - Missing base branch.
   - Worktree creation failure.
   - Dirty base repository when not allowed.

4. `Sonata Context Failures`
   - Missing plan artifact.
   - Missing quality doc.
   - Missing referenced architecture doc.

5. `Agent Failures`
   - Codex not found.
   - App-server startup failure.
   - Turn failure.
   - Turn timeout.
   - User input required.
   - Stall timeout.

6. `Verification Failures`
   - Check command failed.
   - Check command timed out.
   - Required manual smoke evidence missing.

7. `Observability Failures`
   - Log sink failure.
   - UI event stream failure.
   - Artifact open failure.

### 16.2 Recovery Behavior

- Config failures block dispatch for the affected board.
- SQLite write failures stop new dispatch and surface an operator-visible error.
- Git failures fail the current run.
- Missing approved plan blocks implementation.
- Agent failures retry according to retry policy.
- Verification failures keep the card out of `PR Ready`.
- UI failures MUST NOT corrupt orchestrator state.

### 16.3 Restart Recovery

After process restart:

- Load boards, cards, runs, and settings from SQLite.
- Mark previously active runs as interrupted.
- Reconcile preserved workspaces.
- Recompute board counts.
- Do not assume live Codex sessions survived.
- Allow operator to retry interrupted runs.

## 17. Security and Operational Safety

### 17.1 Trust Boundary

V1 is intended for trusted local development environments.

Implementations SHOULD still document:

- Codex approval policy.
- Sandbox policy.
- Whether commands can be auto-approved.
- Which credentials are available to the agent.

### 17.2 Filesystem Safety

Mandatory:

- Agent cwd MUST be per-card worktree.
- Worktree path MUST stay under workspace root.
- Artifact writes MUST stay under target repository or app data roots.
- Branch names MUST be sanitized.
- Secrets MUST NOT be printed in logs or PR packets.

### 17.3 Hook Safety

Hooks are trusted workflow configuration.

Requirements:

- Run hooks with workspace cwd.
- Enforce hook timeout.
- Log hook start and result.
- Truncate hook output in logs.

### 17.4 Auto-Merge Safety

Auto-merge is out of scope for v1.

If implemented in a future version:

- It MUST be disabled by default.
- It MUST require explicit config.
- It MUST require passing checks.
- It MUST be visible in the PR packet and event log.

## 18. Reference Algorithms

### 18.1 Service Startup

```text
function start_service():
  configure_logging()
  open_sqlite_store()
  run_schema_migrations()
  load_boards()
  start_local_api()
  start_ui_event_bus()
  reconcile_interrupted_runs()
  schedule_reconciliation_tick()
  event_loop()
```

### 18.2 Start Plan Run

```text
function start_plan_run(card):
  require card.state == Ready
  require no active run for card
  transition card Ready -> Planning
  run = create_run(card, type=plan)
  dispatch_run(run)
```

### 18.3 Approve Plan

```text
function approve_plan(card, plan_artifact, operator):
  require card.state == Plan Review
  require plan_artifact.status == draft
  mark plan_artifact approved with operator and timestamp
  transition card Plan Review -> Approved
  record event plan_approved
```

### 18.4 Start Implementation Run

```text
function start_implementation_run(card):
  require card.state == Approved
  if no approved plan and not explicit bypass:
    fail with missing_approved_plan

  workspace = prepare_git_worktree(card)
  transition card Approved -> Implementing
  run = create_run(card, type=implement, workspace=workspace)
  dispatch_run(run)
```

### 18.5 Dispatch Run

```text
function dispatch_run(run):
  validate_board_config(run.board_id)
  validate_workflow(run.board_id)
  validate_workspace_policy(run)
  prompt = build_prompt(run)
  session = start_codex_session(run.workspace_path)
  stream_turn(session, prompt, on_event=record_agent_event)
  collect_artifacts(run)
  update_run_status(run)
```

### 18.6 Generate PR Packet

```text
function generate_pr_packet(card):
  require branch exists
  diffstat = git_diffstat(card.branch_name, card.base_branch)
  checks = load_check_results(card)
  packet = render_pr_packet(card, diffstat, checks, artifacts, risks)
  write packet to configured output path
  transition card Verifying -> PR Ready
```

## 19. Test and Validation Matrix

Validation profiles:

- `Core Conformance`: deterministic tests REQUIRED for v1.
- `Reference Implementation`: tests REQUIRED for the TypeScript/Bun and Tauri target.
- `Real Integration Profile`: environment-dependent smoke checks RECOMMENDED before daily use.

### 19.1 Workflow and Config Parsing

- Workflow path defaults to `docs/orchestration/workflow.md`.
- YAML front matter parses into a map.
- Non-map front matter returns typed error.
- Unknown top-level keys are ignored.
- Defaults apply for board, workspace, git, agent, codex, sonata, and PR packet fields.
- `$VAR` resolution works for supported path and secret fields.
- Strict prompt rendering fails on unknown variables.

### 19.2 SQLite Store

- Schema migrations run on empty database.
- Boards persist and reload.
- Cards persist and reload.
- Runs persist and reload.
- Event history persists.
- Interrupted active runs are marked after restart.

### 19.3 Card Transitions

- `Ready` card can start planning.
- `Plan Review` card can be approved.
- `Approved` card can start implementation only with approved plan.
- Missing plan blocks implementation.
- Bypass is rejected unless enabled.
- Blocked dependencies prevent plan dispatch.

### 19.4 Workspace and Git

- Workspace path is deterministic.
- Workspace path stays under root.
- Branch name uses configured prefix.
- Git worktree is created for implementation.
- Existing worktree is reused when valid.
- Dirty base repository is rejected when configured.
- Agent launch outside worktree is rejected.

### 19.5 Agent Runner

- Fake Codex runner can complete plan run.
- Fake Codex runner can complete implementation run.
- Token usage is stored without double counting.
- Turn timeout fails the run.
- User-input-required does not stall indefinitely.
- Approval requests follow documented policy.

### 19.6 Sonata Artifacts

- Plan artifact is written under active plans root.
- Plan approval metadata is recorded.
- Implementation prompt includes approved plan.
- Missing `docs/quality.md` is reported as skipped checks.
- Completed plan can be moved or copied to completed plans root when card reaches done.

### 19.7 PR Packet

- Packet includes card, branch, changed files, checks, artifacts, risks, and token totals.
- Packet generation works without GitHub CLI.
- Provider publishing disabled still produces local packet.
- PR Ready transition happens only after packet generation succeeds.

### 19.8 UI and Local API

- Board UI lists cards by state.
- Operator can create a card.
- Operator can start plan run.
- Operator can approve a plan.
- Operator can start implementation run.
- Run event stream updates UI.
- Artifact links open from UI.

### 19.9 Real Integration Profile

- Run against a real local Git repository.
- Create a card.
- Generate a plan artifact.
- Approve the plan.
- Create a worktree and branch.
- Run a fake or real Codex implementation.
- Generate PR packet.
- Confirm no auto-merge occurred.

## 20. Implementation Checklist

### 20.1 Required For V1

- Root `SPEC.md` exists and defines this contract.
- Tauri shell starts the app.
- React board UI renders local cards.
- Bun daemon owns orchestration state.
- SQLite store persists boards, cards, runs, events, artifacts, and settings.
- One board maps to one repository.
- Workflow loader reads `docs/orchestration/workflow.md`.
- Sonata context loader reads `AGENTS.md` and `docs/quality.md` when present.
- Card state machine is enforced.
- Plan gate blocks implementation without approval.
- Git worktree manager creates isolated worktrees.
- Codex runner launches in the per-card worktree.
- Token usage is recorded.
- Check results are recorded.
- PR packet is generated locally.
- Human review remains required before merge.

### 20.2 Recommended Extensions

- GitHub provider API for PR creation.
- Browser verification evidence capture.
- External tracker import adapters.
- Multi-repo boards.
- Remote worker execution.
- Packaged Bun daemon as Tauri sidecar.
- Configurable dashboard filters and saved views.

### 20.3 Explicitly Deferred

- Auto-merge.
- Multi-tenant cloud hosting.
- Distributed scheduling.
- Required external tracker integration.
- Required GitHub CLI integration.

## Appendix A. Future External Tracker Adapter

An external tracker adapter MAY import or sync cards from another system in a future version.

Rules:

- The local card model remains canonical for orchestration.
- External tracker IDs are stored as metadata.
- Adapter writes MUST be optional.
- Core v1 MUST work without any external tracker.

Possible adapter operations:

- import candidate work items
- sync card status
- add PR packet link
- add run summary comment

Possible future adapter examples include Linear, GitHub Issues, Jira, and local markdown imports.

## Appendix B. Remote Worker Extension

Remote workers are OPTIONAL and out of scope for v1.

If implemented later:

- The board and scheduler remain local authority.
- Remote hosts execute only assigned workspaces.
- Host identity becomes part of run metadata.
- Workspace path safety must be enforced on the remote host.
- Failed remote startup must not duplicate a run on multiple hosts.
