import { existsSync } from "node:fs";
import { normalizeName, type ArtifactRecord, type BoardRecord, type CardRecord, type RunRecord } from "../store";

export type OrchestrationErrorCode =
  | "invalid_transition"
  | "card_not_ready"
  | "card_blocked"
  | "card_run_active"
  | "missing_approved_plan"
  | "missing_workspace"
  | "missing_branch"
  | "missing_pr_inputs";

export class OrchestrationError extends Error {
  constructor(
    readonly code: OrchestrationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OrchestrationError";
  }
}

export const RUN_PHASES = [
  "Queued",
  "PreparingWorkspace",
  "LoadingSonataContext",
  "BuildingPrompt",
  "LaunchingAgentProcess",
  "StreamingTurn",
  "CollectingArtifacts",
  "RunningChecks",
  "WritingPacket",
  "Succeeded",
  "Failed",
  "TimedOut",
  "Stalled",
  "Canceled"
] as const;

export type RunPhase = (typeof RUN_PHASES)[number];
export type RunType = RunRecord["type"];

export const DEFAULT_TRANSITIONS: Record<string, string[]> = {
  inbox: ["ready", "blocked"],
  ready: ["planning", "blocked"],
  planning: ["plan review", "failed"],
  "plan review": ["approved", "ready", "blocked"],
  approved: ["implementing", "ready", "blocked"],
  implementing: ["verifying", "failed", "blocked"],
  verifying: ["pr ready", "implementing", "failed"],
  "pr ready": ["done", "implementing", "blocked"],
  failed: ["ready", "planning", "implementing"],
  blocked: ["ready"]
};

export type TransitionStore = {
  moveCard(cardId: string, state: string, position: number): CardRecord;
  createRun(input: {
    boardId: string;
    cardId: string;
    type: RunType;
    attempt?: number;
    status?: RunRecord["status"];
  }): RunRecord;
  updateRun(runId: string, input: {
    status?: RunRecord["status"];
    startedAt?: string | null;
    finishedAt?: string | null;
    error?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }): RunRecord;
  appendEvent(input: {
    boardId?: string | null;
    cardId?: string | null;
    runId?: string | null;
    type: string;
    payload?: unknown;
  }): string;
  listRuns(input?: { boardId?: string; cardId?: string }): RunRecord[];
  listArtifacts(input?: { boardId?: string; cardId?: string; runId?: string }): ArtifactRecord[];
  upsertRetryEntry(input: {
    boardId: string;
    cardId: string;
    runId?: string | null;
    runType: RunType;
    attempt: number;
    nextAttemptAt: string;
    error?: string | null;
  }): unknown;
  markActiveRunsInterrupted(): RunRecord[];
};

export type EligibilityContext = {
  board: Pick<BoardRecord, "id" | "active">;
  card: CardRecord;
  runs: RunRecord[];
  artifacts: ArtifactRecord[];
  terminalStates?: string[];
  allowPlanBypass?: boolean;
  bypassPlanGate?: boolean;
};

export function transitionCard(
  store: TransitionStore,
  card: CardRecord,
  nextState: string,
  options: { override?: boolean; reason?: string; position?: number } = {}
) {
  const from = normalizeName(card.state);
  const to = normalizeName(nextState);
  const allowed = DEFAULT_TRANSITIONS[from] ?? [];

  if (!options.override && !allowed.includes(to)) {
    throw new OrchestrationError("invalid_transition", `Invalid card transition: ${card.state} -> ${nextState}`);
  }

  const updated = store.moveCard(card.id, nextState, options.position ?? card.position);
  store.appendEvent({
    boardId: card.boardId,
    cardId: card.id,
    type: options.override ? "card_transition_override" : "card_transition",
    payload: { from: card.state, to: nextState, reason: options.reason ?? null }
  });
  return updated;
}

export function assertEligibleForRun(type: RunType, context: EligibilityContext) {
  if (!context.board.active) {
    throw new OrchestrationError("card_not_ready", "Board is inactive");
  }
  if (hasActiveRun(context.runs)) {
    throw new OrchestrationError("card_run_active", "Card already has an active run");
  }
  if (hasBlockingDependency(context.card, context.terminalStates ?? ["Done"])) {
    throw new OrchestrationError("card_blocked", "Card is blocked by a non-terminal dependency");
  }

  const state = normalizeName(context.card.state);
  if (type === "plan" && state !== "ready") {
    throw new OrchestrationError("card_not_ready", "Plan runs require a Ready card");
  }
  if (type === "implement") {
    if (state !== "approved") {
      throw new OrchestrationError("card_not_ready", "Implementation runs require an Approved card");
    }
    if (!hasApprovedPlan(context.card, context.artifacts) && !(context.allowPlanBypass && context.bypassPlanGate)) {
      throw new OrchestrationError("missing_approved_plan", "Implementation requires an approved plan artifact");
    }
  }
  if (type === "verify") {
    if (state !== "verifying") {
      throw new OrchestrationError("card_not_ready", "Verification runs require a Verifying card");
    }
    if (!context.card.branchName) {
      throw new OrchestrationError("missing_branch", "Verification requires an implementation branch");
    }
  }
  if (type === "pr_packet") {
    if (!["verifying", "pr ready"].includes(state)) {
      throw new OrchestrationError("card_not_ready", "PR packet runs require a Verifying or PR Ready card");
    }
    if (!context.card.branchName) {
      throw new OrchestrationError("missing_branch", "PR packet generation requires a branch");
    }
    if (!context.artifacts.some((artifact) => artifact.kind === "verification" || artifact.kind === "log")) {
      throw new OrchestrationError("missing_pr_inputs", "PR packet generation requires verification or log artifacts");
    }
  }
}

export function startRun(
  store: TransitionStore,
  type: RunType,
  context: EligibilityContext,
  options: { attempt?: number; bypassPlanGate?: boolean } = {}
) {
  assertEligibleForRun(type, { ...context, bypassPlanGate: options.bypassPlanGate });

  const nextStateByRun: Partial<Record<RunType, string>> = {
    plan: "Planning",
    implement: "Implementing"
  };
  const nextState = nextStateByRun[type];
  const card = nextState ? transitionCard(store, context.card, nextState, { reason: `${type} run started` }) : context.card;
  const run = store.createRun({
    boardId: context.board.id,
    cardId: context.card.id,
    type,
    attempt: options.attempt ?? nextAttempt(context.runs, type),
    status: "queued"
  });

  store.appendEvent({
    boardId: context.board.id,
    cardId: context.card.id,
    runId: run.id,
    type: "run_queued",
    payload: { runType: type, attempt: run.attempt, bypassPlanGate: Boolean(options.bypassPlanGate) }
  });

  return { card, run };
}

export function completeRun(
  store: TransitionStore,
  input: {
    boardId: string;
    card: CardRecord;
    run: RunRecord;
    ok: boolean;
    error?: string | null;
    tokens?: { input: number; output: number; total: number };
  }
) {
  const now = new Date().toISOString();
  const run = store.updateRun(input.run.id, {
    status: input.ok ? "succeeded" : "failed",
    finishedAt: now,
    error: input.ok ? null : input.error ?? "Run failed",
    inputTokens: input.tokens?.input,
    outputTokens: input.tokens?.output,
    totalTokens: input.tokens?.total
  });

  const nextState = nextStateAfterRun(input.run.type, input.ok);
  if (nextState) {
    transitionCard(store, input.card, nextState, { reason: `${input.run.type} run ${input.ok ? "succeeded" : "failed"}` });
  }

  store.appendEvent({
    boardId: input.boardId,
    cardId: input.card.id,
    runId: run.id,
    type: input.ok ? "run_succeeded" : "run_failed",
    payload: { runType: run.type, error: run.error }
  });

  return run;
}

export function scheduleRetry(
  store: TransitionStore,
  input: {
    boardId: string;
    cardId: string;
    runId?: string | null;
    runType: RunType;
    attempt: number;
    maxRetryBackoffMs: number;
    error?: string | null;
    nowMs?: number;
  }
) {
  const delayMs = Math.min(10000 * 2 ** Math.max(0, input.attempt - 1), input.maxRetryBackoffMs);
  const nextAttemptAt = new Date((input.nowMs ?? Date.now()) + delayMs).toISOString();
  const retry = store.upsertRetryEntry({
    boardId: input.boardId,
    cardId: input.cardId,
    runId: input.runId ?? null,
    runType: input.runType,
    attempt: input.attempt,
    nextAttemptAt,
    error: input.error ?? null
  });

  store.appendEvent({
    boardId: input.boardId,
    cardId: input.cardId,
    runId: input.runId ?? null,
    type: "run_retry_scheduled",
    payload: { runType: input.runType, attempt: input.attempt, delayMs, error: input.error ?? null }
  });

  return retry;
}

export function reconcileOnStartup(store: TransitionStore) {
  const interruptedRuns = store.markActiveRunsInterrupted();
  return {
    interruptedRuns,
    recoveredAt: new Date().toISOString()
  };
}

export function validateWorkspaceForRun(workspacePath: string | null) {
  if (!workspacePath || !existsSync(workspacePath)) {
    throw new OrchestrationError("missing_workspace", "Run requires an existing workspace");
  }
}

function hasActiveRun(runs: RunRecord[]) {
  return runs.some((run) => run.status === "queued" || run.status === "running");
}

function hasApprovedPlan(card: CardRecord, artifacts: ArtifactRecord[]) {
  return Boolean(card.planArtifactPath) || artifacts.some((artifact) => artifact.kind === "plan" && artifact.status === "approved");
}

function hasBlockingDependency(card: CardRecord, terminalStates: string[]) {
  const terminal = new Set(terminalStates.map(normalizeName));
  return card.blockedBy.some((dependency) => {
    if (!dependency || typeof dependency !== "object" || !("state" in dependency)) {
      return true;
    }
    return !terminal.has(normalizeName(String((dependency as { state: unknown }).state)));
  });
}

function nextAttempt(runs: RunRecord[], type: RunType) {
  return runs.filter((run) => run.type === type).reduce((max, run) => Math.max(max, run.attempt), 0) + 1;
}

function nextStateAfterRun(type: RunType, ok: boolean) {
  if (!ok) {
    return "Failed";
  }
  const states: Record<RunType, string | null> = {
    plan: "Plan Review",
    implement: "Verifying",
    verify: null,
    pr_packet: "PR Ready"
  };
  return states[type];
}
