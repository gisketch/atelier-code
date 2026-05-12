import { openStore } from "../store";
import { startRun, transitionCard, type RunType } from "../orchestration";
import type { ApiEnvelope, BoardSnapshot } from "../../shared/contracts";

type ApiStore = ReturnType<typeof openStore>;

export type ApiContext = {
  store: ApiStore;
  version: string;
};

export function createApiContext(input: { dbPath?: string; version?: string } = {}): ApiContext {
  return {
    store: openStore({ dbPath: input.dbPath }),
    version: input.version ?? "0.1.0"
  };
}

export function createAtelierApiFetch(context: ApiContext) {
  return async function fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(null, 204);
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          ok: true,
          service: "atelier-daemon",
          version: context.version,
          storeReady: true
        });
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        return ok({
          service: "atelier-daemon",
          version: context.version,
          migrations: context.store.appliedMigrations
        });
      }

      if (request.method === "GET" && url.pathname === "/api/snapshot") {
        return ok(snapshot(context.store, url.searchParams.get("boardId") ?? undefined));
      }

      if (request.method === "GET" && url.pathname === "/api/boards") {
        return ok(context.store.listBoards());
      }

      if (request.method === "POST" && url.pathname === "/api/boards") {
        const body = await readJson<{
          name: string;
          repoPath: string;
          workspaceRoot?: string | null;
          workflowPath?: string;
        }>(request);
        return ok(
          context.store.createBoard({
            name: body.name,
            repoPath: body.repoPath,
            workspaceRoot: body.workspaceRoot,
            workflowPath: body.workflowPath
          }),
          201
        );
      }

      if (request.method === "GET" && url.pathname.match(/^\/api\/boards\/[^/]+\/cards$/)) {
        const boardId = decodeURIComponent(url.pathname.split("/")[3]);
        return ok(context.store.listCards(boardId));
      }

      if (request.method === "POST" && url.pathname.match(/^\/api\/boards\/[^/]+\/cards$/)) {
        const boardId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJson<{
          title: string;
          description?: string;
          acceptanceCriteria?: string[];
          priority?: number | null;
          state?: string;
          labels?: string[];
        }>(request);
        return ok(
          context.store.createCard({
            boardId,
            title: body.title,
            description: body.description,
            acceptanceCriteria: body.acceptanceCriteria,
            priority: body.priority,
            state: body.state,
            labels: body.labels
          }),
          201
        );
      }

      if (request.method === "POST" && url.pathname.match(/^\/api\/cards\/[^/]+\/move$/)) {
        const cardId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJson<{ state: string; position?: number }>(request);
        const card = mustFind(context.store.getCard(cardId), `Card not found: ${cardId}`);
        return ok(transitionCard(context.store, card, body.state, { override: true, position: body.position }));
      }

      if (request.method === "POST" && url.pathname.match(/^\/api\/cards\/[^/]+\/runs$/)) {
        const cardId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJson<{ type: RunType; bypassPlanGate?: boolean }>(request);
        const card = mustFind(context.store.getCard(cardId), `Card not found: ${cardId}`);
        const board = mustFind(context.store.getBoard(card.boardId), `Board not found: ${card.boardId}`);
        const runs = context.store.listRuns({ cardId });
        const artifacts = context.store.listArtifacts({ cardId });
        return ok(
          startRun(
            context.store,
            body.type,
            {
              board,
              card,
              runs,
              artifacts
            },
            { bypassPlanGate: body.bypassPlanGate }
          ),
          201
        );
      }

      if (request.method === "POST" && url.pathname.match(/^\/api\/artifacts\/[^/]+\/approve$/)) {
        const artifactId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJson<{ operator?: string }>(request);
        const artifact = context.store.approveArtifact(artifactId, {
          approvedBy: body.operator ?? "local",
          approvedAt: new Date().toISOString()
        });
        if (artifact.cardId) {
          const card = mustFind(context.store.getCard(artifact.cardId), `Card not found: ${artifact.cardId}`);
          context.store.updateCard(card.id, { planArtifactPath: artifact.path });
          transitionCard(context.store, card, "Approved", { reason: "plan artifact approved" });
        }
        return ok(artifact);
      }

      if (request.method === "GET" && url.pathname.match(/^\/api\/cards\/[^/]+\/runs$/)) {
        const cardId = decodeURIComponent(url.pathname.split("/")[3]);
        return ok(context.store.listRuns({ cardId }));
      }

      return json({ ok: false, error: { code: "not_found", message: "Not found" } }, 404);
    } catch (error) {
      return json(
        {
          ok: false,
          error: {
            code: error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "request_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        },
        400
      );
    }
  };
}

export function snapshot(store: ApiStore, boardId?: string): BoardSnapshot {
  const boards = store.listBoards();
  const selectedBoard = boardId ? boards.find((board) => board.id === boardId) ?? null : boards[0] ?? null;

  return {
    boards,
    selectedBoard,
    cards: selectedBoard ? store.listCards(selectedBoard.id) : [],
    runs: selectedBoard ? store.listRuns({ boardId: selectedBoard.id }) : [],
    artifacts: selectedBoard ? store.listArtifacts({ boardId: selectedBoard.id }) : []
  };
}

function ok<T>(data: T, status = 200) {
  return json({ ok: true, data } satisfies ApiEnvelope<T>, status);
}

function json(body: unknown, status = 200) {
  return cors(JSON.stringify(body), status, {
    "content-type": "application/json"
  });
}

function cors(body: BodyInit | null, status: number, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...headers
    }
  });
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function mustFind<T>(value: T | null, message: string) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}
