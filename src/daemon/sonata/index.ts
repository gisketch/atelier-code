import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { branchSlug, workspaceKey, type ArtifactRecord, type BoardRecord, type CardRecord, type RunRecord } from "../store";
import { assertPathInside } from "../workspace";
import type { RuntimeWorkflowConfig } from "../workflow";

export type SonataContext = {
  repoPath: string;
  files: Array<{
    role: "agents_map" | "quality_doc" | "architecture_index" | "plan_artifact";
    path: string;
    content: string;
    required: boolean;
  }>;
  warnings: string[];
  qualityStatus: "loaded" | "missing";
  summary: string;
};

export type PlanArtifactInput = {
  board: BoardRecord;
  card: CardRecord;
  run: RunRecord;
  config: RuntimeWorkflowConfig;
  summary: string;
  keyChanges: string[];
  files: string[];
  testPlan: string[];
  assumptions?: string[];
  nonGoals?: string[];
  approvedBy?: string | null;
  approvedAt?: string | null;
};

export type VerificationArtifactInput = {
  board: BoardRecord;
  card: CardRecord;
  run: RunRecord;
  config: RuntimeWorkflowConfig;
  checksRun: string[];
  checksFailed: string[];
  checksSkipped: string[];
  notes?: string;
};

export type PrPacketInput = {
  board: BoardRecord;
  card: CardRecord;
  run: RunRecord;
  config: RuntimeWorkflowConfig;
  branchName: string;
  baseBranch: string | null;
  changedFiles: string[];
  checksRun: string[];
  checksFailed: string[];
  checksSkipped: string[];
  artifacts: ArtifactRecord[];
  risks: string[];
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
};

export class SonataError extends Error {
  constructor(
    readonly code: "artifact_path_escape" | "missing_approved_plan",
    message: string
  ) {
    super(message);
    this.name = "SonataError";
  }
}

export function loadSonataContext(input: {
  repoPath: string;
  config: RuntimeWorkflowConfig;
  runType: RunRecord["type"];
  planArtifactPath?: string | null;
}): SonataContext {
  const repoPath = resolve(input.repoPath);
  const warnings: string[] = [];
  const files: SonataContext["files"] = [];

  readOptional(files, warnings, repoPath, input.config.sonata.agentsMap, "agents_map", false);
  readOptional(files, warnings, repoPath, input.config.sonata.qualityDoc, "quality_doc", false);
  readOptional(files, warnings, repoPath, `${input.config.sonata.architectureRoot}/index.md`, "architecture_index", false);

  if (input.runType === "implement") {
    if (!input.planArtifactPath) {
      throw new SonataError("missing_approved_plan", "Implementation context requires an approved plan artifact");
    }
    readOptional(files, warnings, repoPath, input.planArtifactPath, "plan_artifact", true);
  }

  const qualityStatus = files.some((file) => file.role === "quality_doc") ? "loaded" : "missing";

  return {
    repoPath,
    files,
    warnings,
    qualityStatus,
    summary: files.length
      ? files.map((file) => `${file.role}:${relative(repoPath, file.path)}`).join(", ")
      : "No Sonata context files loaded"
  };
}

export function writePlanArtifact(input: PlanArtifactInput) {
  const slug = branchSlug(input.card.title) || workspaceKey(input.card.identifier).toLowerCase();
  const path = safeRepoPath(input.board.repoPath, input.config.sonata.activePlansRoot, `${input.card.identifier}-${slug}.md`);
  const content = [
    `# ${input.card.identifier}: ${input.card.title}`,
    "",
    `Status: ${input.approvedBy ? "approved" : "draft"}`,
    "",
    "## Summary",
    input.summary,
    "",
    "## Key Changes",
    markdownList(input.keyChanges),
    "",
    "## Files Or Subsystems",
    markdownList(input.files),
    "",
    "## Test Plan",
    markdownList(input.testPlan),
    "",
    "## Assumptions",
    markdownList(input.assumptions ?? ["None"]),
    "",
    "## Non-Goals",
    markdownList(input.nonGoals ?? ["None"]),
    "",
    "## Approval",
    `Approved By: ${input.approvedBy ?? "pending"}`,
    `Approved At: ${input.approvedAt ?? "pending"}`,
    "",
    "## Metadata",
    `Run: ${input.run.id}`,
    `Card: ${input.card.id}`
  ].join("\n");

  writeArtifact(path, content);
  return { path: relative(input.board.repoPath, path), content };
}

export function writeVerificationArtifact(input: VerificationArtifactInput) {
  const slug = branchSlug(input.card.title) || workspaceKey(input.card.identifier).toLowerCase();
  const path = safeRepoPath(input.board.repoPath, input.config.sonata.activePlansRoot, `${input.card.identifier}-${slug}-verification.md`);
  const content = [
    `# Verification: ${input.card.identifier}`,
    "",
    "## Checks Run",
    markdownList(input.checksRun),
    "",
    "## Checks Failed",
    markdownList(input.checksFailed.length ? input.checksFailed : ["None"]),
    "",
    "## Checks Skipped",
    markdownList(input.checksSkipped.length ? input.checksSkipped : ["None"]),
    "",
    "## Notes",
    input.notes ?? "No notes.",
    "",
    "## Metadata",
    `Run: ${input.run.id}`
  ].join("\n");

  writeArtifact(path, content);
  return { path: relative(input.board.repoPath, path), content };
}

export function writePrPacket(input: PrPacketInput) {
  const slug = branchSlug(input.card.title) || workspaceKey(input.card.identifier).toLowerCase();
  const path = safeRepoPath(input.board.repoPath, input.config.prPacket.outputRoot, `${input.card.identifier}-${slug}.md`);
  const tokenLines = input.tokenUsage
    ? [`Input: ${input.tokenUsage.input}`, `Output: ${input.tokenUsage.output}`, `Total: ${input.tokenUsage.total}`]
    : ["Not recorded"];
  const content = [
    `# PR Packet: ${input.card.identifier} ${input.card.title}`,
    "",
    `Branch: ${input.branchName}`,
    `Base: ${input.baseBranch ?? "unknown"}`,
    "",
    "## Summary",
    input.card.description || "No summary provided.",
    "",
    "## Acceptance Criteria",
    markdownList(input.card.acceptanceCriteria.length ? input.card.acceptanceCriteria : ["No criteria recorded"]),
    "",
    "## Changed Files",
    markdownList(input.changedFiles.length ? input.changedFiles : ["No changed files recorded"]),
    "",
    "## Checks Run",
    markdownList(input.checksRun.length ? input.checksRun : ["None"]),
    "",
    "## Checks Failed",
    markdownList(input.checksFailed.length ? input.checksFailed : ["None"]),
    "",
    "## Checks Skipped",
    markdownList(input.checksSkipped.length ? input.checksSkipped : ["None"]),
    "",
    "## Artifacts",
    markdownList(input.artifacts.map((artifact) => `${artifact.kind}: ${artifact.path}`)),
    "",
    "## Token Usage",
    markdownList(tokenLines),
    "",
    "## Risks",
    markdownList(input.risks.length ? input.risks : ["No known residual risks"]),
    "",
    "## Operator Next Steps",
    markdownList(["Review changed files", "Run any skipped checks", "Create or update the pull request manually"])
  ].join("\n");

  writeArtifact(path, content);
  return { path: relative(input.board.repoPath, path), content };
}

function readOptional(
  files: SonataContext["files"],
  warnings: string[],
  repoPath: string,
  relativePath: string,
  role: SonataContext["files"][number]["role"],
  required: boolean
) {
  const path = safeRepoPath(repoPath, relativePath);
  if (!existsSync(path)) {
    const message = `Missing Sonata context file: ${relativePath}`;
    if (required) {
      throw new SonataError("missing_approved_plan", message);
    }
    warnings.push(message);
    return;
  }

  files.push({
    role,
    path,
    content: readFileSync(path, "utf8"),
    required
  });
}

function safeRepoPath(repoPath: string, relativePath: string, leaf?: string) {
  const root = resolve(repoPath);
  const candidate = resolve(root, relativePath, leaf ?? "");
  if (isAbsolute(relativePath)) {
    assertPathInside(root, relativePath);
    return relativePath;
  }
  try {
    assertPathInside(root, candidate);
  } catch (error) {
    throw new SonataError("artifact_path_escape", error instanceof Error ? error.message : String(error));
  }
  return candidate;
}

function writeArtifact(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${content.trim()}\n`, "utf8");
}

function markdownList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}
