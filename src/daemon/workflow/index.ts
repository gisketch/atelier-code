import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { DEFAULT_BOARD_STATES, type BoardRecord } from "../store";

export type WorkflowErrorCode =
  | "missing_workflow_file"
  | "workflow_parse_error"
  | "workflow_front_matter_not_a_map"
  | "template_render_error";

export type WorkflowError = {
  code: WorkflowErrorCode;
  message: string;
  path?: string;
};

export type WorkflowDocument = {
  path: string;
  config: Record<string, unknown>;
  promptTemplate: string;
};

export type WorkflowLoadResult =
  | {
      ok: true;
      workflow: WorkflowDocument;
    }
  | {
      ok: false;
      error: WorkflowError;
    };

export type RuntimeWorkflowConfig = {
  board: {
    states: string[];
    terminalStates: string[];
    blockedStates: string[];
    failedStates: string[];
  };
  workspace: {
    root: string;
    reuseExisting: boolean;
    cleanupOnDone: boolean;
  };
  git: {
    baseBranch: string | null;
    branchPrefix: string;
    worktreeStrategy: "git_worktree";
    allowDirtyBaseRepo: boolean;
    pushEnabled: boolean;
  };
  agent: {
    maxConcurrentRuns: number;
    maxTurnsPlan: number;
    maxTurnsImplement: number;
    maxTurnsVerify: number;
    maxRetryBackoffMs: number;
    requirePlanApproval: boolean;
    allowPlanBypass: boolean;
  };
  codex: {
    command: string;
    approvalPolicy: unknown;
    threadSandbox: unknown;
    turnSandboxPolicy: unknown;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
  sonata: {
    agentsMap: string;
    qualityDoc: string;
    architectureRoot: string;
    activePlansRoot: string;
    completedPlansRoot: string;
    promptMode: string;
    contextBudget: string;
  };
  prPacket: {
    outputRoot: string;
    includeDiffstat: boolean;
    includeCheckLogs: boolean;
    includeTokenUsage: boolean;
    publishProvider: string | null;
  };
  hooks: {
    afterWorktreeCreate: string | null;
    beforeRun: string | null;
    afterRun: string | null;
    beforeCleanup: string | null;
    timeoutMs: number;
  };
};

export type ResolveWorkflowConfigInput = {
  board: Pick<BoardRecord, "repoPath" | "workspaceRoot" | "workflowPath"> & {
    baseBranch?: string | null;
  };
  workflowConfig?: Record<string, unknown>;
  operatorOverrides?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  appDataRoot?: string;
};

const defaultWorkflowPath = "docs/orchestration/workflow.md";

export function loadWorkflow(input: { repoPath: string; workflowPath?: string }): WorkflowLoadResult {
  const workflowPath = resolveWorkflowPath(input.repoPath, input.workflowPath ?? defaultWorkflowPath);

  if (!existsSync(workflowPath)) {
    return {
      ok: false,
      error: {
        code: "missing_workflow_file",
        message: `Workflow file not found at ${workflowPath}`,
        path: workflowPath
      }
    };
  }

  try {
    const workflow = parseWorkflowMarkdown(readFileSync(workflowPath, "utf8"), workflowPath);
    return { ok: true, workflow };
  } catch (error) {
    return {
      ok: false,
      error: toWorkflowError(error, workflowPath)
    };
  }
}

export function parseWorkflowMarkdown(source: string, path = defaultWorkflowPath): WorkflowDocument {
  if (!source.startsWith("---")) {
    return {
      path,
      config: {},
      promptTemplate: source.trim()
    };
  }

  const lines = source.split(/\r?\n/);
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (closingIndex < 0) {
    throw workflowError("workflow_parse_error", "Workflow front matter is missing a closing --- delimiter", path);
  }

  const yaml = lines.slice(1, closingIndex).join("\n");
  const parsed = parseFrontMatterMap(yaml, path);

  if (!isRecord(parsed)) {
    throw workflowError("workflow_front_matter_not_a_map", "Workflow front matter must be a map/object", path);
  }

  return {
    path,
    config: parsed,
    promptTemplate: lines.slice(closingIndex + 1).join("\n").trim()
  };
}

export function resolveWorkflowConfig(input: ResolveWorkflowConfigInput): RuntimeWorkflowConfig {
  const env = input.env ?? Bun.env;
  const appDataRoot = input.appDataRoot ?? defaultAppDataRoot(env);
  const workflowConfig = input.workflowConfig ?? {};
  const merged = deepMerge(defaultConfig(input.board, appDataRoot), workflowConfig, input.operatorOverrides ?? {});

  return {
    board: {
      states: readStringList(merged, ["board", "states"]),
      terminalStates: readStringList(merged, ["board", "terminal_states"]),
      blockedStates: readStringList(merged, ["board", "blocked_states"]),
      failedStates: readStringList(merged, ["board", "failed_states"])
    },
    workspace: {
      root: resolvePathValue(readString(merged, ["workspace", "root"]), appDataRoot, env),
      reuseExisting: readBoolean(merged, ["workspace", "reuse_existing"]),
      cleanupOnDone: readBoolean(merged, ["workspace", "cleanup_on_done"])
    },
    git: {
      baseBranch: readNullableString(merged, ["git", "base_branch"]),
      branchPrefix: readString(merged, ["git", "branch_prefix"]),
      worktreeStrategy: readWorktreeStrategy(merged),
      allowDirtyBaseRepo: readBoolean(merged, ["git", "allow_dirty_base_repo"]),
      pushEnabled: readBoolean(merged, ["git", "push_enabled"])
    },
    agent: {
      maxConcurrentRuns: readInteger(merged, ["agent", "max_concurrent_runs"]),
      maxTurnsPlan: readInteger(merged, ["agent", "max_turns_plan"]),
      maxTurnsImplement: readInteger(merged, ["agent", "max_turns_implement"]),
      maxTurnsVerify: readInteger(merged, ["agent", "max_turns_verify"]),
      maxRetryBackoffMs: readInteger(merged, ["agent", "max_retry_backoff_ms"]),
      requirePlanApproval: readBoolean(merged, ["agent", "require_plan_approval"]),
      allowPlanBypass: readBoolean(merged, ["agent", "allow_plan_bypass"])
    },
    codex: {
      command: readString(merged, ["codex", "command"]),
      approvalPolicy: readUnknown(merged, ["codex", "approval_policy"]),
      threadSandbox: readUnknown(merged, ["codex", "thread_sandbox"]),
      turnSandboxPolicy: readUnknown(merged, ["codex", "turn_sandbox_policy"]),
      turnTimeoutMs: readInteger(merged, ["codex", "turn_timeout_ms"]),
      readTimeoutMs: readInteger(merged, ["codex", "read_timeout_ms"]),
      stallTimeoutMs: readInteger(merged, ["codex", "stall_timeout_ms"])
    },
    sonata: {
      agentsMap: readString(merged, ["sonata", "agents_map"]),
      qualityDoc: readString(merged, ["sonata", "quality_doc"]),
      architectureRoot: readString(merged, ["sonata", "architecture_root"]),
      activePlansRoot: readString(merged, ["sonata", "active_plans_root"]),
      completedPlansRoot: readString(merged, ["sonata", "completed_plans_root"]),
      promptMode: readString(merged, ["sonata", "prompt_mode"]),
      contextBudget: readString(merged, ["sonata", "context_budget"])
    },
    prPacket: {
      outputRoot: readString(merged, ["pr_packet", "output_root"]),
      includeDiffstat: readBoolean(merged, ["pr_packet", "include_diffstat"]),
      includeCheckLogs: readBoolean(merged, ["pr_packet", "include_check_logs"]),
      includeTokenUsage: readBoolean(merged, ["pr_packet", "include_token_usage"]),
      publishProvider: readNullableString(merged, ["pr_packet", "publish_provider"])
    },
    hooks: {
      afterWorktreeCreate: readNullableString(merged, ["hooks", "after_worktree_create"]),
      beforeRun: readNullableString(merged, ["hooks", "before_run"]),
      afterRun: readNullableString(merged, ["hooks", "after_run"]),
      beforeCleanup: readNullableString(merged, ["hooks", "before_cleanup"]),
      timeoutMs: readInteger(merged, ["hooks", "timeout_ms"])
    }
  };
}

export function renderPromptTemplate(template: string, context: Record<string, unknown>) {
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g, (_match, variable: string) => {
    const value = readDottedValue(context, variable);

    if (value === undefined) {
      throw workflowError("template_render_error", `Unknown template variable: ${variable}`);
    }

    if (value === null) {
      return "";
    }

    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

export function resolveWorkflowPath(repoPath: string, workflowPath: string) {
  return isAbsolute(workflowPath) ? workflowPath : resolve(repoPath, workflowPath);
}

function defaultConfig(
  board: Pick<BoardRecord, "repoPath" | "workspaceRoot" | "workflowPath"> & { baseBranch?: string | null },
  appDataRoot: string
) {
  return {
    board: {
      states: DEFAULT_BOARD_STATES.map((state) => state.name),
      terminal_states: ["Done"],
      blocked_states: ["Blocked"],
      failed_states: ["Failed"]
    },
    workspace: {
      root: board.workspaceRoot ?? join(appDataRoot, "workspaces"),
      reuse_existing: true,
      cleanup_on_done: false
    },
    git: {
      base_branch: board.baseBranch ?? null,
      branch_prefix: "sonata/",
      worktree_strategy: "git_worktree",
      allow_dirty_base_repo: false,
      push_enabled: false
    },
    agent: {
      max_concurrent_runs: 1,
      max_turns_plan: 1,
      max_turns_implement: 10,
      max_turns_verify: 4,
      max_retry_backoff_ms: 300000,
      require_plan_approval: true,
      allow_plan_bypass: false
    },
    codex: {
      command: "codex app-server",
      approval_policy: null,
      thread_sandbox: null,
      turn_sandbox_policy: null,
      turn_timeout_ms: 3600000,
      read_timeout_ms: 5000,
      stall_timeout_ms: 300000
    },
    sonata: {
      agents_map: "AGENTS.md",
      quality_doc: "docs/quality.md",
      architecture_root: "docs/architecture",
      active_plans_root: "docs/exec-plans/active",
      completed_plans_root: "docs/exec-plans/completed",
      prompt_mode: "caveman-sonata",
      context_budget: "compact"
    },
    pr_packet: {
      output_root: "docs/pr-packets",
      include_diffstat: true,
      include_check_logs: true,
      include_token_usage: true,
      publish_provider: null
    },
    hooks: {
      after_worktree_create: null,
      before_run: null,
      after_run: null,
      before_cleanup: null,
      timeout_ms: 60000
    }
  };
}

function parseFrontMatterMap(source: string, path: string) {
  const trimmedSource = source.trim();
  if (trimmedSource.startsWith("[") || trimmedSource === "true" || trimmedSource === "false") {
    return parseScalar(trimmedSource, path, 1);
  }

  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: root }];

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const lineWithoutComment = stripComment(rawLine);

    if (!lineWithoutComment.trim()) {
      continue;
    }

    const indent = lineWithoutComment.match(/^ */)?.[0].length ?? 0;
    if (indent % 2 !== 0) {
      throw workflowError("workflow_parse_error", `Invalid indentation on front matter line ${index + 1}`, path);
    }

    const trimmed = lineWithoutComment.trim();
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(trimmed);

    if (!match) {
      throw workflowError("workflow_parse_error", `Unsupported front matter line ${index + 1}: ${trimmed}`, path);
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].target;
    const key = match[1];
    const value = match[2] ?? "";

    if (!value) {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, target: child });
      continue;
    }

    parent[key] = parseScalar(value, path, index + 1);
  }

  return root;
}

function stripComment(line: string) {
  const index = line.indexOf("#");
  return index >= 0 ? line.slice(0, index) : line;
}

function parseScalar(value: string, path: string, line: number): unknown {
  const trimmed = value.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    return inner ? inner.split(",").map((part) => parseScalar(part.trim(), path, line)) : [];
  }
  if (trimmed.startsWith("[") || trimmed.endsWith("]")) {
    throw workflowError("workflow_parse_error", `Malformed inline list on front matter line ${line}`, path);
  }

  return trimmed;
}

function deepMerge<T extends Record<string, unknown>>(...objects: T[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const object of objects) {
    for (const [key, value] of Object.entries(object)) {
      if (isRecord(value) && isRecord(result[key])) {
        result[key] = deepMerge(result[key] as Record<string, unknown>, value);
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

function readDottedValue(root: Record<string, unknown>, path: string) {
  let current: unknown = root;

  for (const part of path.split(".")) {
    if (!isRecord(current) || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function readUnknown(root: Record<string, unknown>, path: string[]) {
  return readPath(root, path);
}

function readPath(root: Record<string, unknown>, path: string[]) {
  let current: unknown = root;

  for (const part of path) {
    if (!isRecord(current) || !(part in current)) {
      throw workflowError("workflow_parse_error", `Missing workflow config value: ${path.join(".")}`);
    }
    current = current[part];
  }

  return current;
}

function readString(root: Record<string, unknown>, path: string[]) {
  const value = readPath(root, path);
  if (typeof value !== "string") {
    throw workflowError("workflow_parse_error", `Expected string for workflow config: ${path.join(".")}`);
  }
  return value;
}

function readNullableString(root: Record<string, unknown>, path: string[]) {
  const value = readPath(root, path);
  if (value === null) return null;
  if (typeof value !== "string") {
    throw workflowError("workflow_parse_error", `Expected string or null for workflow config: ${path.join(".")}`);
  }
  return value;
}

function readBoolean(root: Record<string, unknown>, path: string[]) {
  const value = readPath(root, path);
  if (typeof value !== "boolean") {
    throw workflowError("workflow_parse_error", `Expected boolean for workflow config: ${path.join(".")}`);
  }
  return value;
}

function readInteger(root: Record<string, unknown>, path: string[]) {
  const value = readPath(root, path);
  if (!Number.isInteger(value)) {
    throw workflowError("workflow_parse_error", `Expected integer for workflow config: ${path.join(".")}`);
  }
  return value as number;
}

function readStringList(root: Record<string, unknown>, path: string[]) {
  const value = readPath(root, path);
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw workflowError("workflow_parse_error", `Expected string list for workflow config: ${path.join(".")}`);
  }
  return value;
}

function readWorktreeStrategy(root: Record<string, unknown>) {
  const strategy = readString(root, ["git", "worktree_strategy"]);
  if (strategy !== "git_worktree") {
    throw workflowError("workflow_parse_error", `Unsupported git.worktree_strategy: ${strategy}`);
  }
  return strategy as "git_worktree";
}

function resolvePathValue(value: string, basePath: string, env: Record<string, string | undefined>) {
  const expanded = expandPathValue(value, env);
  if (expanded.startsWith("~/") || expanded === "~") {
    return join(homedir(), expanded.slice(2));
  }
  return isAbsolute(expanded) ? expanded : resolve(basePath, expanded);
}

function expandPathValue(value: string, env: Record<string, string | undefined>) {
  return value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
    const resolved = env[key];
    if (!resolved) {
      throw workflowError("workflow_parse_error", `Missing environment variable referenced by workflow config: ${key}`);
    }
    return resolved;
  });
}

function defaultAppDataRoot(env: Record<string, string | undefined>) {
  return env.ATELIER_APP_DATA ?? join(process.cwd(), ".atelier");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function workflowError(code: WorkflowErrorCode, message: string, path?: string) {
  return Object.assign(new Error(message), { code, path });
}

function toWorkflowError(error: unknown, path: string): WorkflowError {
  if (error instanceof Error && "code" in error) {
    const typedError = error as Error & { code: unknown; path?: unknown };
    const maybeCode = typedError.code;
    if (typeof maybeCode === "string" && isWorkflowErrorCode(maybeCode)) {
      return {
        code: maybeCode,
        message: error.message,
        path: typeof typedError.path === "string" ? typedError.path : path
      };
    }
  }

  return {
    code: "workflow_parse_error",
    message: error instanceof Error ? error.message : String(error),
    path
  };
}

function isWorkflowErrorCode(value: string): value is WorkflowErrorCode {
  return (
    value === "missing_workflow_file" ||
    value === "workflow_parse_error" ||
    value === "workflow_front_matter_not_a_map" ||
    value === "template_render_error"
  );
}
