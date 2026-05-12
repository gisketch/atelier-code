import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../store";
import { resolveWorkflowConfig } from "../workflow";
import { createDisabledPublisher, generatePrPacket, readPacketContent } from ".";

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

test("generatePrPacket writes a local packet and moves clean cards to PR Ready", () => {
  const fixture = createFixture();
  fixture.store.createArtifact({
    boardId: fixture.board.id,
    cardId: fixture.card.id,
    runId: fixture.run.id,
    kind: "verification",
    path: "docs/exec-plans/active/CARD-001-verification.md",
    status: "final",
    metadata: {
      checksRun: ["bun test"],
      checksFailed: [],
      checksSkipped: []
    }
  });

  const packet = generatePrPacket({
    ...fixture,
    artifacts: fixture.store.listArtifacts({ cardId: fixture.card.id }),
    publisher: createDisabledPublisher()
  });

  expect(packet.ready).toBe(true);
  expect(packet.path).toMatch(/^docs[\\/]pr-packets/);
  expect(readFileSync(join(fixture.root, packet.path), "utf8")).toContain("Human-review handoff");
  expect(fixture.store.getCard(fixture.card.id)).toMatchObject({
    state: "PR Ready",
    prPacketPath: packet.path
  });
  fixture.store.close();
});

test("failed checks are visible and block PR Ready", () => {
  const fixture = createFixture();
  fixture.store.createArtifact({
    boardId: fixture.board.id,
    cardId: fixture.card.id,
    runId: fixture.run.id,
    kind: "verification",
    path: "docs/exec-plans/active/CARD-001-verification.md",
    status: "final",
    metadata: {
      checksRun: ["bun test"],
      checksFailed: ["bun test"],
      checksSkipped: []
    }
  });

  const packet = generatePrPacket({
    ...fixture,
    artifacts: fixture.store.listArtifacts({ cardId: fixture.card.id })
  });

  expect(packet.ready).toBe(false);
  expect(packet.blockedReason).toBe("Failed checks block PR Ready");
  expect(fixture.store.getCard(fixture.card.id)).toMatchObject({ state: "Verifying" });
  expect(readPacketContent({ repoPath: fixture.root, packetPath: packet.path })).toContain("bun test");
  fixture.store.close();
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "atelier-pr-packet-"));
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
    title: "Packet",
    description: "Human-review handoff",
    acceptanceCriteria: ["packet generated"],
    state: "Verifying"
  });
  store.updateCard(card.id, { branchName: "sonata/card-001-packet" });
  const updatedCard = store.getCard(card.id)!;
  const run = store.createRun({
    boardId: board.id,
    cardId: card.id,
    type: "pr_packet",
    status: "running"
  });
  const config = resolveWorkflowConfig({
    board: {
      ...board,
      baseBranch: "master"
    },
    appDataRoot: join(root, "app-data")
  });

  return { root, store, board, card: updatedCard, run, config, workspacePath: null };
}
