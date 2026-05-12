import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadWorkflow,
  parseWorkflowMarkdown,
  renderPromptTemplate,
  resolveWorkflowConfig,
  resolveWorkflowPath
} from ".";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("loadWorkflow returns actionable missing file errors", () => {
  const repo = createTempRepo();
  const result = loadWorkflow({ repoPath: repo });

  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "missing_workflow_file"
    }
  });

  if (!result.ok) {
    expect(result.error.path).toContain("docs");
    expect(result.error.message).toContain("Workflow file not found");
  }
});

test("parseWorkflowMarkdown handles optional front matter and trims prompt body", () => {
  const parsed = parseWorkflowMarkdown(`# Prompt\n\nUse {{card.title}}`);
  expect(parsed.config).toEqual({});
  expect(parsed.promptTemplate).toBe("# Prompt\n\nUse {{card.title}}");
});

test("parseWorkflowMarkdown reads nested front matter maps", () => {
  const parsed = parseWorkflowMarkdown(`---
board:
  states: [Inbox, Ready, Done]
workspace:
  root: $WORKSPACE_ROOT
agent:
  max_concurrent_runs: 2
  require_plan_approval: false
---

Implement {{card.title}}
`);

  expect(parsed.config).toMatchObject({
    board: { states: ["Inbox", "Ready", "Done"] },
    workspace: { root: "$WORKSPACE_ROOT" },
    agent: {
      max_concurrent_runs: 2,
      require_plan_approval: false
    }
  });
  expect(parsed.promptTemplate).toBe("Implement {{card.title}}");
});

test("parseWorkflowMarkdown rejects unclosed front matter", () => {
  expect(() => parseWorkflowMarkdown("---\nboard:\n  states: [Ready]\n")).toThrow(
    "Workflow front matter is missing"
  );
});

test("parseWorkflowMarkdown rejects non-map front matter", () => {
  expect(() => parseWorkflowMarkdown("---\n[not, a, map]\n---\nPrompt")).toThrow(
    "Workflow front matter must be a map/object"
  );
});

test("resolveWorkflowConfig applies defaults, workflow config, env paths, and overrides", () => {
  const config = resolveWorkflowConfig({
    appDataRoot: "C:/app-data",
    env: { WORKSPACE_ROOT: "D:/workspace-root" },
    board: {
      repoPath: "C:/repo/project",
      workflowPath: "docs/orchestration/workflow.md",
      workspaceRoot: null,
      baseBranch: "master"
    },
    workflowConfig: {
      workspace: {
        root: "$WORKSPACE_ROOT",
        cleanup_on_done: true
      },
      git: {
        branch_prefix: "custom/"
      },
      agent: {
        max_concurrent_runs: 3
      }
    },
    operatorOverrides: {
      agent: {
        max_concurrent_runs: 1
      }
    }
  });

  expect(config.workspace).toMatchObject({
    root: "D:/workspace-root",
    reuseExisting: true,
    cleanupOnDone: true
  });
  expect(config.git).toMatchObject({
    baseBranch: "master",
    branchPrefix: "custom/",
    worktreeStrategy: "git_worktree"
  });
  expect(config.agent.maxConcurrentRuns).toBe(1);
  expect(config.codex.command).toBe("codex app-server");
});

test("resolveWorkflowConfig rejects invalid typed config", () => {
  expect(() =>
    resolveWorkflowConfig({
      appDataRoot: "C:/app-data",
      board: {
        repoPath: "C:/repo/project",
        workflowPath: "docs/orchestration/workflow.md",
        workspaceRoot: null
      },
      workflowConfig: {
        git: {
          worktree_strategy: "copy"
        }
      }
    })
  ).toThrow("Unsupported git.worktree_strategy");
});

test("renderPromptTemplate replaces dotted variables and rejects unknown variables", () => {
  expect(
    renderPromptTemplate("Plan {{card.identifier}}: {{card.title}} in {{repo.path}}", {
      card: { identifier: "CARD-001", title: "Workflow loader" },
      repo: { path: "C:/repo/project" }
    })
  ).toBe("Plan CARD-001: Workflow loader in C:/repo/project");

  expect(() => renderPromptTemplate("Use {{card.missing}}", { card: {} })).toThrow(
    "Unknown template variable: card.missing"
  );
});

test("loadWorkflow reads the default repo workflow file", () => {
  const repo = createTempRepo();
  const workflowDir = join(repo, "docs", "orchestration");
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(join(workflowDir, "workflow.md"), "---\nagent:\n  max_turns_plan: 2\n---\nPrompt");

  const result = loadWorkflow({ repoPath: repo });
  expect(result.ok).toBe(true);

  if (result.ok) {
    expect(result.workflow.promptTemplate).toBe("Prompt");
    expect(result.workflow.config).toMatchObject({
      agent: { max_turns_plan: 2 }
    });
  }
});

test("resolveWorkflowPath resolves relative paths from the repo root", () => {
  expect(resolveWorkflowPath("C:/repo/project", "docs/orchestration/workflow.md")).toBe(
    "C:\\repo\\project\\docs\\orchestration\\workflow.md"
  );
});

function createTempRepo() {
  const root = mkdtempSync(join(tmpdir(), "atelier-workflow-"));
  tempRoots.push(root);
  return root;
}
