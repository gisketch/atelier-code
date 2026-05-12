import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../store";
import { resolveWorkflowConfig } from "../workflow";
import {
  loadSonataContext,
  SonataError,
  writePlanArtifact,
  writePrPacket,
  writeVerificationArtifact
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

test("loadSonataContext reads present context and warns for missing optional files", () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.root, "AGENTS.md"), "# Agents\n");
  mkdirSync(join(fixture.root, "docs"), { recursive: true });
  writeFileSync(join(fixture.root, "docs", "quality.md"), "# Quality\n");

  const context = loadSonataContext({
    repoPath: fixture.root,
    config: fixture.config,
    runType: "plan"
  });

  expect(context.files.map((file) => file.role)).toEqual(["agents_map", "quality_doc"]);
  expect(context.qualityStatus).toBe("loaded");
  expect(context.warnings).toContain("Missing Sonata context file: docs/architecture/index.md");
});

test("implementation context requires an approved plan artifact", () => {
  const fixture = createFixture();

  expect(() =>
    loadSonataContext({
      repoPath: fixture.root,
      config: fixture.config,
      runType: "implement"
    })
  ).toThrow(SonataError);
});

test("artifact writers keep output under repo and include required fields", () => {
  const fixture = createFixture();
  const plan = writePlanArtifact({
    ...fixture,
    summary: "Plan summary",
    keyChanges: ["Add module"],
    files: ["src/daemon/sonata"],
    testPlan: ["bun test"],
    assumptions: ["Local only"],
    nonGoals: ["Auto merge"]
  });
  expect(plan.path).toMatch(/^docs[\\/]exec-plans[\\/]active/);
  expect(readFileSync(join(fixture.root, plan.path), "utf8")).toContain("## Test Plan");

  const verification = writeVerificationArtifact({
    ...fixture,
    checksRun: ["bun test"],
    checksFailed: [],
    checksSkipped: ["browser smoke"]
  });
  expect(readFileSync(join(fixture.root, verification.path), "utf8")).toContain("browser smoke");

  const packet = writePrPacket({
    ...fixture,
    branchName: "sonata/card-001-artifacts",
    baseBranch: "master",
    changedFiles: ["src/daemon/sonata/index.ts"],
    checksRun: ["bun test"],
    checksFailed: [],
    checksSkipped: [],
    artifacts: [],
    risks: [],
    tokenUsage: { input: 1, output: 2, total: 3 }
  });
  const packetContent = readFileSync(join(fixture.root, packet.path), "utf8");
  expect(packetContent).toContain("Branch: sonata/card-001-artifacts");
  expect(packetContent).toContain("Create or update the pull request manually");
});

test("artifact writers reject paths that escape the repository", () => {
  const fixture = createFixture({
    sonata: { active_plans_root: "../outside" }
  });

  expect(() =>
    writePlanArtifact({
      ...fixture,
      summary: "bad",
      keyChanges: ["bad"],
      files: ["bad"],
      testPlan: ["bad"]
    })
  ).toThrow("Workspace path escapes root");
});

function createFixture(workflowConfig: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "atelier-sonata-"));
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
    title: "Artifacts",
    description: "Generate artifacts",
    acceptanceCriteria: ["packet complete"],
    state: "Planning"
  });
  const run = store.createRun({
    boardId: board.id,
    cardId: card.id,
    type: "plan"
  });
  const config = resolveWorkflowConfig({
    board: {
      ...board,
      baseBranch: "master"
    },
    workflowConfig,
    appDataRoot: join(root, "app-data")
  });
  store.close();
  return { root, board, card, run, config };
}
