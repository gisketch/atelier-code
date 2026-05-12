import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ArtifactRecord, BoardRecord, CardRecord, EventRecord, RetryEntryRecord, RunRecord } from "../store";
import { assertPathInside } from "../workspace";
import type { RuntimeWorkflowConfig } from "../workflow";

export type FailureClass =
  | "config"
  | "sqlite"
  | "git"
  | "sonata_context"
  | "agent"
  | "verification"
  | "observability"
  | "unknown";

export type RuntimeSnapshot = {
  boardId: string;
  activeRuns: RunRecord[];
  retryQueue: RetryEntryRecord[];
  countsByState: Record<string, number>;
  tokenTotals: {
    input: number;
    output: number;
    total: number;
  };
  recentFailures: RunRecord[];
  workspacePaths: string[];
  branchNames: string[];
  events: EventRecord[];
};

export type ObservabilityStore = {
  createArtifact(input: {
    boardId: string;
    cardId?: string | null;
    runId?: string | null;
    kind: "log";
    path: string;
    status?: "final";
    metadata?: Record<string, unknown>;
  }): ArtifactRecord;
  appendEvent(input: {
    boardId?: string | null;
    cardId?: string | null;
    runId?: string | null;
    type: string;
    payload?: unknown;
  }): string;
  listRuns(input?: { boardId?: string; cardId?: string }): RunRecord[];
  listCards(boardId: string): CardRecord[];
  listRetryEntries(boardId: string): RetryEntryRecord[];
  listEvents(input?: { boardId?: string; cardId?: string; runId?: string; limit?: number }): EventRecord[];
};

export class SafetyError extends Error {
  constructor(
    readonly code: "unsafe_path" | "unsafe_hook" | "unsafe_approval_policy",
    message: string
  ) {
    super(message);
    this.name = "SafetyError";
  }
}

export function formatStructuredLog(input: {
  boardId: string;
  cardId: string;
  cardIdentifier: string;
  runId: string;
  runType: RunRecord["type"];
  sessionId?: string | null;
  level: "info" | "warn" | "error";
  message: string;
}) {
  return [
    `level=${input.level}`,
    `board_id=${input.boardId}`,
    `card_id=${input.cardId}`,
    `card_identifier=${input.cardIdentifier}`,
    `run_id=${input.runId}`,
    `run_type=${input.runType}`,
    `session_id=${input.sessionId ?? ""}`,
    `message=${quoteValue(input.message)}`
  ].join(" ");
}

export function recordRunLog(
  store: ObservabilityStore,
  input: {
    board: BoardRecord;
    card: CardRecord;
    run: RunRecord;
    level: "info" | "warn" | "error";
    message: string;
  }
) {
  const line = formatStructuredLog({
    boardId: input.board.id,
    cardId: input.card.id,
    cardIdentifier: input.card.identifier,
    runId: input.run.id,
    runType: input.run.type,
    level: input.level,
    message: input.message
  });
  store.appendEvent({
    boardId: input.board.id,
    cardId: input.card.id,
    runId: input.run.id,
    type: "run_log",
    payload: {
      level: input.level,
      message: input.message,
      line
    }
  });

  return line;
}

export function buildRuntimeSnapshot(
  store: ObservabilityStore,
  input: {
    board: BoardRecord;
  }
): RuntimeSnapshot {
  const cards = store.listCards(input.board.id);
  const runs = store.listRuns({ boardId: input.board.id });
  const activeRuns = runs.filter((run) => run.status === "queued" || run.status === "running");
  const tokenTotals = runs.reduce(
    (totals, run) => ({
      input: totals.input + run.inputTokens,
      output: totals.output + run.outputTokens,
      total: totals.total + run.totalTokens
    }),
    { input: 0, output: 0, total: 0 }
  );

  return {
    boardId: input.board.id,
    activeRuns,
    retryQueue: store.listRetryEntries(input.board.id),
    countsByState: cards.reduce<Record<string, number>>((counts, card) => {
      counts[card.state] = (counts[card.state] ?? 0) + 1;
      return counts;
    }, {}),
    tokenTotals,
    recentFailures: runs.filter((run) => run.status === "failed").slice(0, 10),
    workspacePaths: cards.map((card) => card.repoPath).filter((path): path is string => Boolean(path)),
    branchNames: cards.map((card) => card.branchName).filter((branch): branch is string => Boolean(branch)),
    events: store.listEvents({ boardId: input.board.id, limit: 50 })
  };
}

export function classifyFailure(error: unknown): FailureClass {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (code.includes("workflow") || code.includes("config") || message.includes("workflow")) return "config";
  if (message.includes("sqlite") || message.includes("database")) return "sqlite";
  if (code.includes("git") || code.includes("branch") || message.includes("git ")) return "git";
  if (code.includes("sonata") || code.includes("plan artifact") || message.includes("approved plan")) return "sonata_context";
  if (code.includes("agent") || message.includes("codex") || message.includes("app-server")) return "agent";
  if (message.includes("check") || message.includes("verification")) return "verification";
  if (message.includes("log") || message.includes("event")) return "observability";
  return "unknown";
}

export function assertSafeRuntimePaths(input: { workspaceRoot: string; workspacePath: string; artifactRoot: string; artifactPath: string }) {
  assertSafePath(input.workspaceRoot, input.workspacePath);
  assertSafePath(input.artifactRoot, input.artifactPath);
}

export function validateHookPolicy(script: string | null, timeoutMs: number) {
  if (!script) {
    return;
  }
  if (timeoutMs <= 0 || timeoutMs > 300000) {
    throw new SafetyError("unsafe_hook", "Hook timeout must be between 1ms and 300000ms");
  }
  const lowered = script.toLowerCase();
  const forbidden = ["rm -rf", "remove-item -recurse", "git reset --hard", "format ", "del /s"];
  const match = forbidden.find((pattern) => lowered.includes(pattern));
  if (match) {
    throw new SafetyError("unsafe_hook", `Hook contains unsafe command pattern: ${match}`);
  }
}

export function validateApprovalPolicy(config: RuntimeWorkflowConfig) {
  const approval = String(config.codex.approvalPolicy ?? "").toLowerCase();
  if ((approval.includes("never") || approval.includes("auto")) && !config.agent.allowPlanBypass) {
    throw new SafetyError("unsafe_approval_policy", "High-trust approval behavior requires explicit allow_plan_bypass");
  }
}

export function assertSafePath(root: string, candidate: string) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  assertPathInside(rootPath, candidatePath);
  if (existsSync(candidatePath) && candidatePath === rootPath) {
    throw new SafetyError("unsafe_path", "Runtime path cannot be the safety root itself");
  }
}

function quoteValue(value: string) {
  return JSON.stringify(value).replace(/\s+/g, " ");
}
