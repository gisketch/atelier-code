import { existsSync } from "node:fs";
import { renderPromptTemplate, type RuntimeWorkflowConfig, type WorkflowDocument } from "../workflow";
import type { BoardRecord, CardRecord, RunRecord } from "../store";

export type AgentEventType =
  | "session_started"
  | "startup_failed"
  | "turn_started"
  | "turn_completed"
  | "turn_failed"
  | "turn_cancelled"
  | "turn_input_required"
  | "approval_requested"
  | "approval_resolved"
  | "usage_updated"
  | "rate_limit_updated"
  | "notification"
  | "malformed";

export type AgentEvent = {
  type: AgentEventType;
  timestamp: string;
  boardId: string;
  cardId: string;
  runId: string;
  sessionId?: string;
  message: string;
  usage?: TokenUsage;
};

export type TokenUsage = {
  input: number;
  output: number;
  total: number;
};

export type PromptContext = {
  board: BoardRecord;
  card: CardRecord;
  run: RunRecord;
  repo: {
    path: string;
    baseBranch: string | null;
  };
  workflow: WorkflowDocument;
  workflowConfig: RuntimeWorkflowConfig;
  sonata: {
    promptMode: string;
    contextSummary: string;
    qualityStatus: string;
  };
  plan?: {
    status: "missing" | "draft" | "approved" | "bypassed";
    path?: string | null;
    content?: string | null;
  };
  attempt: number;
};

export type AgentLaunch = {
  command: string;
  cwd: string;
  prompt: string;
  run: RunRecord;
};

export type AgentTransport = {
  launch(input: AgentLaunch, onEvent: (event: Omit<AgentEvent, "timestamp" | "boardId" | "cardId" | "runId">) => void): Promise<{
    ok: boolean;
    message: string;
    usage?: TokenUsage;
  }>;
};

export type RunAgentInput = {
  board: BoardRecord;
  card: CardRecord;
  run: RunRecord;
  workflow: WorkflowDocument;
  workflowConfig: RuntimeWorkflowConfig;
  workspacePath: string;
  sonata: PromptContext["sonata"];
  plan?: PromptContext["plan"];
  transport: AgentTransport;
  onEvent?: (event: AgentEvent) => void;
};

export class RunnerError extends Error {
  constructor(
    readonly code: "missing_workspace" | "agent_failed",
    message: string
  ) {
    super(message);
    this.name = "RunnerError";
  }
}

export function buildRunPrompt(context: PromptContext) {
  const template = context.workflow.promptTemplate || defaultPromptForRun(context.run.type);
  const rendered = renderPromptTemplate(template, {
    board: context.board,
    card: context.card,
    run: context.run,
    repo: context.repo,
    workflow: context.workflowConfig,
    sonata: context.sonata,
    plan: context.plan ?? { status: "missing" },
    attempt: context.attempt
  });

  return [
    `Mode: ${context.sonata.promptMode}`,
    `Run type: ${context.run.type}`,
    `Card: ${context.card.identifier} ${context.card.title}`,
    `Plan gate: ${context.plan?.status ?? "missing"}`,
    `Repo: ${context.repo.path}`,
    `Context: ${context.sonata.contextSummary}`,
    "",
    rendered,
    "",
    runRequirements(context.run.type)
  ].join("\n");
}

export async function runAgentTurn(input: RunAgentInput) {
  if (!existsSync(input.workspacePath)) {
    throw new RunnerError("missing_workspace", `Agent workspace does not exist: ${input.workspacePath}`);
  }

  const prompt = buildRunPrompt({
    board: input.board,
    card: input.card,
    run: input.run,
    repo: {
      path: input.board.repoPath,
      baseBranch: input.workflowConfig.git.baseBranch
    },
    workflow: input.workflow,
    workflowConfig: input.workflowConfig,
    sonata: input.sonata,
    plan: input.plan,
    attempt: input.run.attempt
  });

  const emit = (event: Omit<AgentEvent, "timestamp" | "boardId" | "cardId" | "runId">) => {
    input.onEvent?.({
      ...event,
      timestamp: new Date().toISOString(),
      boardId: input.board.id,
      cardId: input.card.id,
      runId: input.run.id
    });
  };

  emit({ type: "session_started", message: "Agent session prepared" });
  const result = await input.transport.launch(
    {
      command: input.workflowConfig.codex.command,
      cwd: input.workspacePath,
      prompt,
      run: input.run
    },
    emit
  );

  if (!result.ok) {
    emit({ type: "turn_failed", message: result.message, usage: result.usage });
    throw new RunnerError("agent_failed", result.message);
  }

  emit({ type: "turn_completed", message: result.message, usage: result.usage });
  return {
    prompt,
    message: result.message,
    usage: result.usage ?? { input: 0, output: 0, total: 0 }
  };
}

export function createFakeAgentTransport(input: { response?: string; fail?: boolean; usage?: TokenUsage } = {}): AgentTransport {
  return {
    async launch(launch, onEvent) {
      onEvent({ type: "turn_started", message: `Started ${launch.run.type} in ${launch.cwd}` });
      const usage = input.usage ?? estimateUsage(launch.prompt, input.response ?? "ok");
      onEvent({ type: "usage_updated", message: "Token usage updated", usage });
      return {
        ok: !input.fail,
        message: input.response ?? (input.fail ? "Fake agent failed" : "Fake agent completed"),
        usage
      };
    }
  };
}

export function applyTokenDelta(previous: TokenUsage, nextAbsolute: TokenUsage) {
  return {
    input: Math.max(0, nextAbsolute.input - previous.input),
    output: Math.max(0, nextAbsolute.output - previous.output),
    total: Math.max(0, nextAbsolute.total - previous.total)
  };
}

function defaultPromptForRun(type: RunRecord["type"]) {
  if (type === "plan") {
    return "Create a Sonata execution plan artifact. Inspect only what is needed. Do not mutate code.";
  }
  if (type === "implement") {
    return "Implement the approved plan in this worktree. Run the configured checks and report changed files.";
  }
  if (type === "verify") {
    return "Run deterministic verification first. Record skipped manual checks clearly.";
  }
  return "Generate a local PR packet for human review. Do not merge.";
}

function runRequirements(type: RunRecord["type"]) {
  if (type === "plan") {
    return "Requirement: write only the plan artifact under docs/exec-plans/active.";
  }
  if (type === "implement") {
    return "Requirement: use the approved plan, keep cwd in the card worktree, and preserve human review.";
  }
  if (type === "verify") {
    return "Requirement: produce verification evidence and check results.";
  }
  return "Requirement: include branch, changed files, checks, artifacts, risks, and next steps.";
}

function estimateUsage(prompt: string, response: string): TokenUsage {
  const input = Math.ceil(prompt.length / 4);
  const output = Math.ceil(response.length / 4);
  return {
    input,
    output,
    total: input + output
  };
}
