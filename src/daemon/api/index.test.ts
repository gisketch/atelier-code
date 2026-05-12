import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiContext, createAtelierApiFetch } from ".";
import type { ApiEnvelope, BoardSnapshot, StoreBoard, StoreCard } from "../../shared/contracts";

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

test("local API exposes board, card, and snapshot operations", async () => {
  const { fetch } = createFixture();
  const boardResponse = await request<StoreBoard>(fetch, "/api/boards", {
    method: "POST",
    body: {
      name: "Main",
      repoPath: "C:/repo/project"
    }
  });
  expect(boardResponse.name).toBe("Main");

  const cardResponse = await request<StoreCard>(fetch, `/api/boards/${boardResponse.id}/cards`, {
    method: "POST",
    body: {
      title: "Wire API",
      state: "Ready",
      acceptanceCriteria: ["snapshot lists card"]
    }
  });
  expect(cardResponse.title).toBe("Wire API");

  const snapshot = await request<BoardSnapshot>(fetch, "/api/snapshot");
  expect(snapshot.selectedBoard?.id).toBe(boardResponse.id);
  expect(snapshot.cards).toHaveLength(1);
});

test("start run endpoint enforces state machine errors through envelopes", async () => {
  const { fetch } = createFixture();
  const board = await request<StoreBoard>(fetch, "/api/boards", {
    method: "POST",
    body: { name: "Main", repoPath: "C:/repo/project" }
  });
  const card = await request<StoreCard>(fetch, `/api/boards/${board.id}/cards`, {
    method: "POST",
    body: { title: "Cannot implement", state: "Approved" }
  });

  const response = await fetch(
    new Request(`http://127.0.0.1/api/cards/${card.id}/runs`, {
      method: "POST",
      body: JSON.stringify({ type: "implement" }),
      headers: { "content-type": "application/json" }
    })
  );
  const payload = (await response.json()) as ApiEnvelope<unknown>;

  expect(response.status).toBe(400);
  expect(payload).toMatchObject({
    ok: false,
    error: { code: "missing_approved_plan" }
  });
});

test("approve artifact endpoint records approval and moves card to Approved", async () => {
  const { context, fetch } = createFixture();
  const board = context.store.createBoard({ name: "Main", repoPath: "C:/repo/project" });
  const card = context.store.createCard({ boardId: board.id, title: "Approve me", state: "Plan Review" });
  const artifact = context.store.createArtifact({
    boardId: board.id,
    cardId: card.id,
    kind: "plan",
    path: "docs/exec-plans/active/CARD-001.md"
  });

  await request(fetch, `/api/artifacts/${artifact.id}/approve`, {
    method: "POST",
    body: { operator: "tester" }
  });

  expect(context.store.getCard(card.id)).toMatchObject({
    state: "Approved",
    planArtifactPath: artifact.path
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "atelier-api-"));
  tempRoots.push(root);
  const context = createApiContext({ dbPath: join(root, "store.sqlite") });
  const fetch = createAtelierApiFetch(context);
  return { context, fetch };
}

async function request<T>(
  fetch: (request: Request) => Promise<Response>,
  path: string,
  input: { method?: string; body?: unknown } = {}
) {
  const response = await fetch(
    new Request(`http://127.0.0.1${path}`, {
      method: input.method ?? "GET",
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: { "content-type": "application/json" }
    })
  );
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!payload.ok) {
    throw new Error(payload.error.message);
  }
  return payload.data;
}
