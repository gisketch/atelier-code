import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore, type CardRecord } from "../store";
import {
  assertEligibleForRun,
  completeRun,
  OrchestrationError,
  reconcileOnStartup,
  scheduleRetry,
  startRun,
  transitionCard
} from ".";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // SQLite cleanup is best effort on Windows.
      }
    }
  }
});

test("invalid card transitions are rejected", () => {
  const { store, board, card } = createFixture("Ready");

  expect(() => transitionCard(store, card, "Done")).toThrow(OrchestrationError);

  const planning = transitionCard(store, card, "Planning");
  expect(planning.state).toBe("Planning");
  store.close();
});

test("plan run moves Ready cards through lifecycle", () => {
  const { store, board, card } = createFixture("Ready");
  const started = startRun(store, "plan", {
    board,
    card,
    runs: [],
    artifacts: []
  });

  expect(started.card.state).toBe("Planning");
  expect(started.run).toMatchObject({ type: "plan", status: "queued", attempt: 1 });

  const latestCard = store.getCard(card.id) as CardRecord;
  completeRun(store, {
    boardId: board.id,
    card: latestCard,
    run: started.run,
    ok: true,
    tokens: { input: 10, output: 20, total: 30 }
  });

  expect(store.getCard(card.id)).toMatchObject({ state: "Plan Review" });
  expect(store.getRun(started.run.id)).toMatchObject({ status: "succeeded", totalTokens: 30 });
  store.close();
});

test("implementation is blocked without approved plan unless bypass is configured", () => {
  const { store, board, card } = createFixture("Approved");

  expect(() =>
    assertEligibleForRun("implement", {
      board,
      card,
      runs: [],
      artifacts: []
    })
  ).toThrow("Implementation requires an approved plan artifact");

  const artifact = store.createArtifact({
    boardId: board.id,
    cardId: card.id,
    kind: "plan",
    path: "docs/exec-plans/active/CARD-001.md",
    status: "approved"
  });
  expect(() =>
    assertEligibleForRun("implement", {
      board,
      card,
      runs: [],
      artifacts: [artifact]
    })
  ).not.toThrow();
  store.close();
});

test("active runs block duplicate dispatch and restart reconciliation interrupts them", () => {
  const { store, board, card } = createFixture("Ready");
  const first = startRun(store, "plan", { board, card, runs: [], artifacts: [] });

  expect(() =>
    assertEligibleForRun("plan", {
      board,
      card,
      runs: [first.run],
      artifacts: []
    })
  ).toThrow("Card already has an active run");

  const recovery = reconcileOnStartup(store);
  expect(recovery.interruptedRuns).toHaveLength(1);
  expect(store.getRun(first.run.id)).toMatchObject({ status: "interrupted" });
  store.close();
});

test("retry backoff is deterministic and append-logged", () => {
  const { store, board, card } = createFixture("Failed");
  const retry = scheduleRetry(store, {
    boardId: board.id,
    cardId: card.id,
    runType: "plan",
    attempt: 3,
    maxRetryBackoffMs: 300000,
    error: "nope",
    nowMs: Date.UTC(2026, 4, 12, 0, 0, 0)
  }) as { nextAttemptAt: string };

  expect(retry.nextAttemptAt).toBe("2026-05-12T00:00:40.000Z");
  expect(store.listRetryEntries(board.id)).toHaveLength(1);
  store.close();
});

function createFixture(state: string) {
  const root = mkdtempSync(join(tmpdir(), "atelier-orchestration-"));
  tempRoots.push(root);
  const store = openStore({ dbPath: join(root, "store.sqlite") });
  const board = store.createBoard({
    id: "board-main",
    name: "Main",
    repoPath: root
  });
  const card = store.createCard({
    id: "card-main",
    boardId: board.id,
    identifier: "CARD-001",
    title: "Do work",
    state
  });

  return { root, store, board, card };
}
