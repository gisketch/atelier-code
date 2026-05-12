import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { transitionCard, type TransitionStore } from "../orchestration";
import type { ArtifactRecord, BoardRecord, CardRecord, RunRecord } from "../store";
import { writePrPacket } from "../sonata";
import type { RuntimeWorkflowConfig } from "../workflow";
import { assertPathInside, getBranchStatus } from "../workspace";

export type PacketPublisher = {
  name: string;
  publish(packet: GeneratedPrPacket): Promise<PublishResult>;
};

export type PublishResult =
  | {
      ok: true;
      url?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type GeneratedPrPacket = {
  path: string;
  content: string;
  ready: boolean;
  blockedReason: string | null;
  changedFiles: string[];
  checksRun: string[];
  checksFailed: string[];
  checksSkipped: string[];
};

export type PrPacketStore = TransitionStore & {
  createArtifact(input: {
    boardId: string;
    cardId?: string | null;
    runId?: string | null;
    kind: "pr_packet";
    path: string;
    status?: "draft" | "final";
    metadata?: Record<string, unknown>;
  }): ArtifactRecord;
  updateCard(cardId: string, input: Partial<Pick<CardRecord, "prPacketPath">>): CardRecord;
};

export function generatePrPacket(input: {
  store: PrPacketStore;
  board: BoardRecord;
  card: CardRecord;
  run: RunRecord;
  config: RuntimeWorkflowConfig;
  workspacePath?: string | null;
  artifacts: ArtifactRecord[];
  publisher?: PacketPublisher | null;
}): GeneratedPrPacket {
  const checkSummary = collectCheckSummary(input.artifacts);
  const branchStatus =
    input.workspacePath && existsSync(input.workspacePath)
      ? getBranchStatus(input.workspacePath)
      : {
          branchName: input.card.branchName ?? "unknown",
          headSha: "",
          changedFiles: [] as string[],
          dirty: false
        };
  const ready = checkSummary.checksFailed.length === 0;
  const packet = writePrPacket({
    board: input.board,
    card: input.card,
    run: input.run,
    config: input.config,
    branchName: input.card.branchName ?? branchStatus.branchName,
    baseBranch: input.config.git.baseBranch,
    changedFiles: branchStatus.changedFiles,
    checksRun: checkSummary.checksRun,
    checksFailed: checkSummary.checksFailed,
    checksSkipped: checkSummary.checksSkipped,
    artifacts: input.artifacts,
    risks: ready ? [] : ["Failed checks block PR Ready"],
    tokenUsage: {
      input: input.run.inputTokens,
      output: input.run.outputTokens,
      total: input.run.totalTokens
    }
  });

  const artifact = input.store.createArtifact({
    boardId: input.board.id,
    cardId: input.card.id,
    runId: input.run.id,
    kind: "pr_packet",
    path: packet.path,
    status: ready ? "final" : "draft",
    metadata: {
      ready,
      blockedReason: ready ? null : "Failed checks block PR Ready",
      changedFiles: branchStatus.changedFiles,
      checksRun: checkSummary.checksRun,
      checksFailed: checkSummary.checksFailed,
      checksSkipped: checkSummary.checksSkipped,
      publishProvider: input.publisher?.name ?? null
    }
  });
  input.store.updateCard(input.card.id, { prPacketPath: artifact.path });

  if (ready) {
    transitionCard(input.store, input.card, "PR Ready", { reason: "PR packet generated" });
  } else {
    input.store.appendEvent({
      boardId: input.board.id,
      cardId: input.card.id,
      runId: input.run.id,
      type: "pr_packet_blocked",
      payload: {
        checksFailed: checkSummary.checksFailed
      }
    });
  }

  return {
    path: packet.path,
    content: packet.content,
    ready,
    blockedReason: ready ? null : "Failed checks block PR Ready",
    changedFiles: branchStatus.changedFiles,
    ...checkSummary
  };
}

export function createDisabledPublisher(): PacketPublisher {
  return {
    name: "disabled",
    async publish() {
      return {
        ok: false,
        error: "Provider publishing is disabled for v1"
      };
    }
  };
}

export function readPacketContent(input: { repoPath: string; packetPath: string }) {
  const path = isAbsolute(input.packetPath) ? input.packetPath : resolve(input.repoPath, input.packetPath);
  assertPathInside(input.repoPath, path);
  return readFileSync(path, "utf8");
}

function collectCheckSummary(artifacts: ArtifactRecord[]) {
  const checksRun = new Set<string>();
  const checksFailed = new Set<string>();
  const checksSkipped = new Set<string>();

  for (const artifact of artifacts) {
    readStringArray(artifact.metadata.checksRun).forEach((check) => checksRun.add(check));
    readStringArray(artifact.metadata.checksFailed).forEach((check) => checksFailed.add(check));
    readStringArray(artifact.metadata.checksSkipped).forEach((check) => checksSkipped.add(check));
  }

  return {
    checksRun: [...checksRun],
    checksFailed: [...checksFailed],
    checksSkipped: [...checksSkipped]
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
