import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../store";
import { resolveWorkflowConfig } from "../workflow";
import {
  assertSafeRuntimePaths,
  buildRuntimeSnapshot,
  classifyFailure,
  formatStructuredLog,
  recordRunLog,
  SafetyError,
  validateApprovalPolicy,
  validateHookPolicy
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

test("structured logs include stable run context and persist as events", () => {
  const fixture = createFixture();
  const line = recordRunLog(fixture.store, {
    board: fixture.board,
    card: fixture.card,
    run: fixture.run,
    level: "info",
    message: "started"
  });

  expect(line).toContain(`board_id=${fixture.board.id}`);
  expect(line).toContain(`card_identifier=${fixture.card.identifier}`);
  expect(fixture.store.listEvents({ runId: fixture.run.id })).toHaveLength(1);
  fixture.store.close();
});

test("runtime snapshot exposes active runs, retry queue, counts, tokens, and events", () => {
  const fixture = createFixture();
  fixture.store.updateRun(fixture.run.id, {
    status: "running",
    inputTokens: 3,
    outputTokens: 4,
    totalTokens: 7
  });
  fixture.store.upsertRetryEntry({
    boardId: fixture.board.id,
    cardId: fixture.card.id,
    runType: "plan",
    attempt: 2,
    nextAttemptAt: "2026-05-12T00:00:00.000Z"
  });
  fixture.store.appendEvent({ boardId: fixture.board.id, cardId: fixture.card.id, runId: fixture.run.id, type: "test" });

  const snapshot = buildRuntimeSnapshot(fixture.store, { board: fixture.board });

  expect(snapshot.activeRuns).toHaveLength(1);
  expect(snapshot.retryQueue).toHaveLength(1);
  expect(snapshot.countsByState.Ready).toBe(1);
  expect(snapshot.tokenTotals.total).toBe(7);
  expect(snapshot.events).toHaveLength(1);
  fixture.store.close();
});

test("failure classification maps known failure families", () => {
  expect(classifyFailure(Object.assign(new Error("Workflow file missing"), { code: "missing_workflow_file" }))).toBe("config");
  expect(classifyFailure(Object.assign(new Error("git branch failed"), { code: "git_command_failed" }))).toBe("git");
  expect(classifyFailure(new Error("approved plan required"))).toBe("sonata_context");
  expect(classifyFailure(new Error("check command failed"))).toBe("verification");
});

test("safety guards reject dangerous paths, hooks, and high-trust approval without explicit config", () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-safety-"));
  tempRoots.push(root);
  expect(() =>
    assertSafeRuntimePaths({
      workspaceRoot: join(root, "workspaces"),
      workspacePath: join(root, "workspaces", "card"),
      artifactRoot: join(root, "repo"),
      artifactPath: join(root, "outside", "packet.md")
    })
  ).toThrow();
  expect(() => validateHookPolicy("git reset --hard HEAD", 1000)).toThrow(SafetyError);

  const fixture = createFixture();
  const config = resolveWorkflowConfig({
    board: fixture.board,
    workflowConfig: {
      codex: { approval_policy: "auto" },
      agent: { allow_plan_bypass: false }
    },
    appDataRoot: join(root, "app-data")
  });
  expect(() => validateApprovalPolicy(config)).toThrow(SafetyError);
  fixture.store.close();
});

test("formatStructuredLog remains compact key value text", () => {
  expect(
    formatStructuredLog({
      boardId: "b",
      cardId: "c",
      cardIdentifier: "CARD-1",
      runId: "r",
      runType: "plan",
      level: "warn",
      message: "needs input"
    })
  ).toContain('message="needs input"');
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "atelier-observability-"));
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
    title: "Observe",
    state: "Ready"
  });
  const run = store.createRun({
    boardId: board.id,
    cardId: card.id,
    type: "plan"
  });
  return { root, store, board, card, run };
}
