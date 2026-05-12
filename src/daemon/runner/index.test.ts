import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../store";
import { parseWorkflowMarkdown, resolveWorkflowConfig } from "../workflow";
import {
  applyTokenDelta,
  buildRunPrompt,
  createFakeAgentTransport,
  runAgentTurn,
  RunnerError,
  type AgentEvent
} from ".";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows cleanup is best effort.
      }
    }
  }
});

test("buildRunPrompt renders workflow template with card and plan context", () => {
  const fixture = createFixture();
  const prompt = buildRunPrompt({
    ...fixture,
    repo: { path: fixture.board.repoPath, baseBranch: "master" },
    sonata: {
      promptMode: "caveman-sonata",
      contextSummary: "AGENTS.md loaded",
      qualityStatus: "docs/quality.md loaded"
    },
    plan: { status: "approved", path: "docs/exec-plans/active/CARD-001.md" },
    attempt: 1
  });

  expect(prompt).toContain("Run type: plan");
  expect(prompt).toContain("Card: CARD-001 Build runner");
  expect(prompt).toContain("Implement CARD-001 using approved");
  expect(prompt).toContain("write only the plan artifact");
});

test("runAgentTurn emits durable events and returns token usage", async () => {
  const fixture = createFixture();
  const workspacePath = join(fixture.root, "workspace");
  mkdirSync(workspacePath);
  const events: AgentEvent[] = [];

  const result = await runAgentTurn({
    ...fixture,
    workspacePath,
    sonata: {
      promptMode: "caveman-sonata",
      contextSummary: "compact context",
      qualityStatus: "available"
    },
    plan: { status: "approved" },
    transport: createFakeAgentTransport({
      response: "done",
      usage: { input: 12, output: 5, total: 17 }
    }),
    onEvent: (event) => events.push(event)
  });

  expect(result.usage).toEqual({ input: 12, output: 5, total: 17 });
  expect(events.map((event) => event.type)).toEqual([
    "session_started",
    "turn_started",
    "usage_updated",
    "turn_completed"
  ]);
  expect(events[0]).toMatchObject({
    boardId: fixture.board.id,
    cardId: fixture.card.id,
    runId: fixture.run.id
  });
});

test("runAgentTurn rejects missing workspaces before launch", async () => {
  const fixture = createFixture();

  await expect(
    runAgentTurn({
      ...fixture,
      workspacePath: join(fixture.root, "missing"),
      sonata: {
        promptMode: "caveman-sonata",
        contextSummary: "compact context",
        qualityStatus: "available"
      },
      transport: createFakeAgentTransport()
    })
  ).rejects.toThrow(RunnerError);
});

test("token deltas do not double count absolute reports", () => {
  expect(applyTokenDelta({ input: 10, output: 8, total: 18 }, { input: 15, output: 9, total: 24 })).toEqual({
    input: 5,
    output: 1,
    total: 6
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "atelier-runner-"));
  tempRoots.push(root);
  const store = openStore({ dbPath: join(root, "store.sqlite") });
  const board = store.createBoard({
    id: "board-main",
    name: "Main",
    repoPath: root
  });
  const card = store.createCard({
    boardId: board.id,
    identifier: "CARD-001",
    title: "Build runner",
    state: "Planning"
  });
  const run = store.createRun({
    boardId: board.id,
    cardId: card.id,
    type: "plan"
  });
  const workflow = parseWorkflowMarkdown("Implement {{card.identifier}} using {{plan.status}}", "workflow.md");
  const workflowConfig = resolveWorkflowConfig({
    board: {
      ...board,
      baseBranch: "master"
    },
    workflowConfig: workflow.config,
    appDataRoot: join(root, "app-data")
  });
  store.close();

  return { root, board, card, run, workflow, workflowConfig };
}
