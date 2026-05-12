import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore, type ArtifactRecord } from "../store";
import { assistedDispatch, buildDispatchSnapshot, manualDispatch } from ".";

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

test("dispatch order is priority, created time, then identifier", () => {
  const { store, board } = createFixture();
  store.createCard({ boardId: board.id, identifier: "CARD-003", title: "Third", state: "Ready", priority: 2 });
  store.createCard({ boardId: board.id, identifier: "CARD-001", title: "First", state: "Ready", priority: 1 });
  store.createCard({ boardId: board.id, identifier: "CARD-002", title: "Second", state: "Ready", priority: 1 });

  const snapshot = buildDispatchSnapshot({
    board,
    cards: store.listCards(board.id),
    runs: [],
    artifacts: [],
    config: { mode: "manual", maxConcurrentRuns: 3 }
  });

  expect(snapshot.queued.map((item) => item.cardIdentifier)).toEqual(["CARD-001", "CARD-002", "CARD-003"]);
  store.close();
});

test("concurrency limit controls visible queue and skip reasons", () => {
  const { store, board } = createFixture();
  const first = store.createCard({ boardId: board.id, identifier: "CARD-001", title: "First", state: "Ready" });
  store.createCard({ boardId: board.id, identifier: "CARD-002", title: "Second", state: "Ready" });
  store.createRun({ boardId: board.id, cardId: first.id, type: "plan", status: "running" });

  const snapshot = buildDispatchSnapshot({
    board,
    cards: store.listCards(board.id),
    runs: store.listRuns({ boardId: board.id }),
    artifacts: [],
    config: { mode: "manual", maxConcurrentRuns: 1 }
  });

  expect(snapshot.availableSlots).toBe(0);
  expect(snapshot.queued).toHaveLength(0);
  expect(snapshot.skipped.map((skip) => skip.reason)).toContain("Card already has an active run");
  expect(snapshot.skipped.map((skip) => skip.reason)).toContain("Concurrency limit reached");
  store.close();
});

test("only eligible cards enter assisted dispatch", () => {
  const { store, board } = createFixture();
  const ready = store.createCard({ boardId: board.id, identifier: "CARD-001", title: "Ready", state: "Ready" });
  store.createCard({ boardId: board.id, identifier: "CARD-002", title: "Blocked", state: "Blocked" });
  const approved = store.createCard({ boardId: board.id, identifier: "CARD-003", title: "Approved", state: "Approved" });
  store.createArtifact({
    boardId: board.id,
    cardId: approved.id,
    kind: "plan",
    path: "docs/exec-plans/active/CARD-003.md",
    status: "approved"
  });

  const result = assistedDispatch(store, {
    boardId: board.id,
    config: { mode: "assisted", maxConcurrentRuns: 2 }
  });

  expect(result.started.map((entry) => entry.run.cardId).sort()).toEqual([approved.id, ready.id].sort());
  expect(store.listRuns({ boardId: board.id })).toHaveLength(2);
  store.close();
});

test("manual dispatch enforces concurrency before queueing a run", () => {
  const { store, board } = createFixture();
  const first = store.createCard({ boardId: board.id, title: "Running", state: "Ready" });
  const second = store.createCard({ boardId: board.id, title: "Waiting", state: "Ready" });
  store.createRun({ boardId: board.id, cardId: first.id, type: "plan", status: "queued" });

  expect(() =>
    manualDispatch(store, {
      boardId: board.id,
      cardId: second.id,
      runType: "plan",
      config: { mode: "manual", maxConcurrentRuns: 1 }
    })
  ).toThrow("Concurrency limit reached");
  store.close();
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "atelier-scheduler-"));
  tempRoots.push(root);
  const store = openStore({ dbPath: join(root, "store.sqlite") });
  const board = store.createBoard({
    id: "board-main",
    name: "Main",
    repoPath: root
  });

  return { root, store, board, artifacts: [] as ArtifactRecord[] };
}
