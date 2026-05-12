import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { branchSlug, normalizeName, openStore, workspaceKey } from ".";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows can hold SQLite files briefly after close; temp cleanup is best-effort.
      }
    }
  }
});

test("normalization helpers produce stable identifiers", () => {
  expect(normalizeName("  Plan Review ")).toBe("plan review");
  expect(workspaceKey("CARD 1: Fix/Auth")).toBe("CARD_1_Fix_Auth");
  expect(branchSlug("Add durable SQLite store!!!")).toBe("add-durable-sqlite-store");
});

test("migrations create the phase 1 domain schema", () => {
  const { store } = createTempStore();
  const tables = store
    .rawForTests()
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'boards', 'cards', 'runs', 'artifacts', 'settings',
         'event_history', 'token_totals', 'retry_entries', 'live_session_snapshots'
       )
       ORDER BY name`
    )
    .all()
    .map((row) => row.name);

  expect(tables).toEqual([
    "artifacts",
    "boards",
    "cards",
    "event_history",
    "live_session_snapshots",
    "retry_entries",
    "runs",
    "settings",
    "token_totals"
  ]);

  store.close();
});

test("boards and cards round-trip through sqlite after restart", () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-store-"));
  tempRoots.push(root);
  const dbPath = join(root, "store.sqlite");

  const first = openStore({ dbPath });
  const board = first.createBoard({
    id: "board-main",
    name: "Main",
    repoPath: "C:/repo/project"
  });
  const card = first.createCard({
    boardId: board.id,
    title: "Persist a card",
    description: "Round-trip through sqlite.",
    acceptanceCriteria: ["created", "loaded"],
    labels: ["Store", " store "]
  });
  first.close();

  const second = openStore({ dbPath });
  expect(second.getBoard("board-main")).toMatchObject({
    id: "board-main",
    name: "Main",
    repoPath: "C:/repo/project"
  });
  expect(second.getCard(card.id)).toMatchObject({
    title: "Persist a card",
    acceptanceCriteria: ["created", "loaded"],
    labels: ["store"],
    state: "Inbox",
    stateNormalized: "inbox"
  });
  second.close();
});

test("card state must exist on the board", () => {
  const { store } = createTempStore();
  const board = store.createBoard({
    name: "Main",
    repoPath: "C:/repo/project"
  });

  expect(() =>
    store.createCard({
      boardId: board.id,
      title: "Invalid state",
      state: "Not A State"
    })
  ).toThrow();

  store.close();
});

test("card ordering and moves are durable", () => {
  const { store } = createTempStore();
  const board = store.createBoard({
    id: "board-order",
    name: "Main",
    repoPath: "C:/repo/project"
  });

  const first = store.createCard({ boardId: board.id, title: "First", state: "Ready" });
  const second = store.createCard({ boardId: board.id, title: "Second", state: "Ready" });

  expect(first.position).toBe(0);
  expect(second.position).toBe(1);

  const moved = store.moveCard(second.id, "Planning", 0);
  expect(moved).toMatchObject({
    state: "Planning",
    stateNormalized: "planning",
    position: 0
  });

  store.close();
});

test("event history is append-only", () => {
  const { store } = createTempStore();
  const eventId = store.appendEvent({
    type: "store_test",
    payload: { ok: true }
  });

  expect(() =>
    store
      .rawForTests()
      .query("UPDATE event_history SET type = ? WHERE id = ?")
      .run("mutated", eventId)
  ).toThrow("event_history is append-only");

  expect(() =>
    store.rawForTests().query("DELETE FROM event_history WHERE id = ?").run(eventId)
  ).toThrow("event_history is append-only");

  store.close();
});

function createTempStore() {
  const root = mkdtempSync(join(tmpdir(), "atelier-store-"));
  tempRoots.push(root);
  const store = openStore({ dbPath: join(root, "store.sqlite") });
  return { root, store };
}
