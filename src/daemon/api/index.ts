import { openStore } from "../store";
import { startRun, transitionCard, type RunType } from "../orchestration";
import { assistedDispatch, buildDispatchSnapshot, manualDispatch, type DispatchConfig } from "../scheduler";
import { generatePrPacket, readPacketContent } from "../pr-packet";
import { resolveWorkflowConfig } from "../workflow";
import { buildRuntimeSnapshot } from "../observability";
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

      if (request.method === "GET" && url.pathname.match(/^\/api\/boards\/[^/]+\/dispatch$/)) {
        const boardId = decodeURIComponent(url.pathname.split("/")[3]);
        return ok(dispatchSnapshot(context.store, boardId, dispatchConfigFromQuery(url.searchParams)));
      }

      if (request.method === "GET" && url.pathname.match(/^\/api\/boards\/[^/]+\/runtime$/)) {
        const boardId = decodeURIComponent(url.pathname.split("/")[3]);
        const board = mustFind(context.store.getBoard(boardId), `Board not found: ${boardId}`);
        return ok(buildRuntimeSnapshot(context.store, { board }));
      }

      if (request.method === "POST" && url.pathname.match(/^\/api\/boards\/[^/]+\/dispatch$/)) {
        const boardId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJson<Partial<DispatchConfig>>(request);
        return ok(
          assistedDispatch(context.store, {
            boardId,
            config: {
              mode: "assisted",
              maxConcurrentRuns: body.maxConcurrentRuns ?? 1
            }
          }),
          201
        );
      }

      if (request.method === "GET" && url.pathname === "/api/boards") {
        return ok(context.store.listBoards());
      }

      if (request.method === "GET" && url.pathname === "/api/settings") {
        return ok(context.store.listSettings());
      }

      if (request.method === "POST" && url.pathname === "/api/settings") {
        const body = await readJson<{ scope?: "app" | "board"; scopeId?: string; key: string; value: unknown }>(request);
        return ok(context.store.setSetting(body), 201);
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
        const body = await readJson<{ type: RunType; bypassPlanGate?: boolean; maxConcurrentRuns?: number }>(request);
        const card = mustFind(context.store.getCard(cardId), `Card not found: ${cardId}`);
        const board = mustFind(context.store.getBoard(card.boardId), `Board not found: ${card.boardId}`);
        return ok(
          body.bypassPlanGate
            ? startRun(
                context.store,
                body.type,
                {
                  board,
                  card,
                  runs: context.store.listRuns({ cardId }),
                  artifacts: context.store.listArtifacts({ cardId })
                },
                { bypassPlanGate: body.bypassPlanGate }
              )
            : manualDispatch(context.store, {
                boardId: board.id,
                cardId,
                runType: body.type,
                config: { mode: "manual", maxConcurrentRuns: body.maxConcurrentRuns ?? 1 }
              }),
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

      if (request.method === "POST" && url.pathname.match(/^\/api\/cards\/[^/]+\/pr-packet$/)) {
        const cardId = decodeURIComponent(url.pathname.split("/")[3]);
        const card = mustFind(context.store.getCard(cardId), `Card not found: ${cardId}`);
        const board = mustFind(context.store.getBoard(card.boardId), `Board not found: ${card.boardId}`);
        const body = await readJson<{ runId?: string; workspacePath?: string | null }>(request);
        const run =
          (body.runId ? context.store.getRun(body.runId) : context.store.listRuns({ cardId }).find((candidate) => candidate.type === "pr_packet")) ??
          context.store.createRun({
            boardId: board.id,
            cardId,
            type: "pr_packet",
            status: "running"
          });
        const config = resolveWorkflowConfig({ board });
        return ok(
          generatePrPacket({
            store: context.store,
            board,
            card,
            run,
            config,
            workspacePath: body.workspacePath,
            artifacts: context.store.listArtifacts({ cardId })
          }),
          201
        );
      }

      if (request.method === "GET" && url.pathname.match(/^\/api\/artifacts\/[^/]+\/content$/)) {
        const artifactId = decodeURIComponent(url.pathname.split("/")[3]);
        const artifact = mustFind(context.store.getArtifact(artifactId), `Artifact not found: ${artifactId}`);
        const board = mustFind(context.store.getBoard(artifact.boardId), `Board not found: ${artifact.boardId}`);
        return ok({
          artifact,
          content: readPacketContent({
            repoPath: board.repoPath,
            packetPath: artifact.path
          })
        });
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
  const cards = selectedBoard ? store.listCards(selectedBoard.id) : [];
  const runs = selectedBoard ? store.listRuns({ boardId: selectedBoard.id }) : [];
  const artifacts = selectedBoard ? store.listArtifacts({ boardId: selectedBoard.id }) : [];

  return {
    boards,
    selectedBoard,
    cards,
    runs,
    artifacts,
    dispatch: selectedBoard
      ? buildDispatchSnapshot({
          board: selectedBoard,
          cards,
          runs,
          artifacts,
          config: { mode: "manual", maxConcurrentRuns: 1 }
        })
      : undefined
  };
}

function dispatchSnapshot(store: ApiStore, boardId: string, config: DispatchConfig) {
  const board = mustFind(store.getBoard(boardId), `Board not found: ${boardId}`);
  return buildDispatchSnapshot({
    board,
    cards: store.listCards(boardId),
    runs: store.listRuns({ boardId }),
    artifacts: store.listArtifacts({ boardId }),
    config
  });
}

function dispatchConfigFromQuery(searchParams: URLSearchParams): DispatchConfig {
  return {
    mode: searchParams.get("mode") === "assisted" ? "assisted" : "manual",
    maxConcurrentRuns: Number(searchParams.get("maxConcurrentRuns") ?? "1")
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
