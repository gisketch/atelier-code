import {
  assertEligibleForRun,
  startRun,
  type RunType,
  type TransitionStore
} from "../orchestration";
import type { ArtifactRecord, BoardRecord, CardRecord, RunRecord } from "../store";
import type { DispatchMode, DispatchQueueItem, DispatchSkip, DispatchSnapshot } from "../../shared/contracts";

export type SchedulerStore = TransitionStore & {
  getBoard(id: string): BoardRecord | null;
  getCard(id: string): CardRecord | null;
  listCards(boardId: string): CardRecord[];
  listRuns(input?: { boardId?: string; cardId?: string }): RunRecord[];
  listArtifacts(input?: { boardId?: string; cardId?: string; runId?: string }): ArtifactRecord[];
};

export type DispatchConfig = {
  mode: DispatchMode;
  maxConcurrentRuns: number;
};

export type DispatchStartResult = {
  started: Array<{
    card: CardRecord;
    run: RunRecord;
  }>;
  snapshot: DispatchSnapshot;
};

export function buildDispatchSnapshot(input: {
  board: BoardRecord;
  cards: CardRecord[];
  runs: RunRecord[];
  artifacts: ArtifactRecord[];
  config: DispatchConfig;
}): DispatchSnapshot {
  const activeRunCount = input.runs.filter(isActiveRun).length;
  const availableSlots = Math.max(0, input.config.maxConcurrentRuns - activeRunCount);
  const queued: DispatchQueueItem[] = [];
  const skipped: DispatchSkip[] = [];

  for (const card of sortDispatchCards(input.cards)) {
    const runType = inferNextRunType(card);
    if (!runType) {
      skipped.push(skip(card, "No dispatchable state"));
      continue;
    }

    const cardRuns = input.runs.filter((run) => run.cardId === card.id);
    const cardArtifacts = input.artifacts.filter((artifact) => artifact.cardId === card.id);

    try {
      assertEligibleForRun(runType, {
        board: input.board,
        card,
        runs: cardRuns,
        artifacts: cardArtifacts
      });
      queued.push({
        cardId: card.id,
        cardIdentifier: card.identifier,
        title: card.title,
        runType,
        priority: card.priority,
        createdAt: card.createdAt
      });
    } catch (error) {
      skipped.push(skip(card, error instanceof Error ? error.message : String(error)));
    }
  }

  return {
    mode: input.config.mode,
    maxConcurrentRuns: input.config.maxConcurrentRuns,
    activeRunCount,
    availableSlots,
    queued: queued.slice(0, availableSlots),
    skipped: [
      ...queued.slice(availableSlots).map((item) => ({
        cardId: item.cardId,
        cardIdentifier: item.cardIdentifier,
        title: item.title,
        reason: "Concurrency limit reached"
      })),
      ...skipped
    ]
  };
}

export function manualDispatch(
  store: SchedulerStore,
  input: {
    boardId: string;
    cardId: string;
    runType: RunType;
    config: DispatchConfig;
  }
) {
  const board = mustFind(store.getBoard(input.boardId), `Board not found: ${input.boardId}`);
  const card = mustFind(store.getCard(input.cardId), `Card not found: ${input.cardId}`);
  enforceConcurrency(store.listRuns({ boardId: board.id }), input.config.maxConcurrentRuns);
  return startRun(store, input.runType, {
    board,
    card,
    runs: store.listRuns({ cardId: card.id }),
    artifacts: store.listArtifacts({ cardId: card.id })
  });
}

export function assistedDispatch(
  store: SchedulerStore,
  input: {
    boardId: string;
    config: DispatchConfig;
  }
): DispatchStartResult {
  const board = mustFind(store.getBoard(input.boardId), `Board not found: ${input.boardId}`);
  const cards = store.listCards(board.id);
  const runs = store.listRuns({ boardId: board.id });
  const artifacts = store.listArtifacts({ boardId: board.id });
  const snapshot = buildDispatchSnapshot({
    board,
    cards,
    runs,
    artifacts,
    config: { ...input.config, mode: "assisted" }
  });
  const started = [];

  for (const item of snapshot.queued) {
    if (started.length >= snapshot.availableSlots) {
      break;
    }
    const card = mustFind(store.getCard(item.cardId), `Card not found: ${item.cardId}`);
    const result = startRun(store, item.runType, {
      board,
      card,
      runs: store.listRuns({ cardId: card.id }),
      artifacts: store.listArtifacts({ cardId: card.id })
    });
    started.push(result);
  }

  return {
    started,
    snapshot
  };
}

export function inferNextRunType(card: CardRecord): RunType | null {
  if (card.stateNormalized === "ready") return "plan";
  if (card.stateNormalized === "approved") return "implement";
  if (card.stateNormalized === "verifying") return "pr_packet";
  return null;
}

function sortDispatchCards(cards: CardRecord[]) {
  return [...cards].sort(
    (left, right) =>
      (left.priority ?? 9999) - (right.priority ?? 9999) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.identifier.localeCompare(right.identifier)
  );
}

function isActiveRun(run: RunRecord) {
  return run.status === "queued" || run.status === "running";
}

function enforceConcurrency(runs: RunRecord[], maxConcurrentRuns: number) {
  const activeRunCount = runs.filter(isActiveRun).length;
  if (activeRunCount >= maxConcurrentRuns) {
    throw new Error("Concurrency limit reached");
  }
}

function skip(card: CardRecord, reason: string): DispatchSkip {
  return {
    cardId: card.id,
    cardIdentifier: card.identifier,
    title: card.title,
    reason
  };
}

function mustFind<T>(value: T | null, message: string) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}
