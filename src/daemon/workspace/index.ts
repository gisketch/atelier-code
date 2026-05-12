import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { branchSlug, workspaceKey, type CardRecord } from "../store";

export type WorkspaceErrorCode =
  | "repo_not_found"
  | "repo_not_git"
  | "base_branch_missing"
  | "workspace_escape"
  | "workspace_is_base_repo"
  | "dirty_base_repo"
  | "worktree_invalid"
  | "git_command_failed";

export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export type PrepareWorkspaceInput = {
  repoPath: string;
  workspaceRoot: string;
  branchPrefix: string;
  baseBranch: string;
  card: Pick<CardRecord, "identifier" | "title">;
  reuseExisting: boolean;
  allowDirtyBaseRepo: boolean;
};

export type WorkspacePlan = {
  workspaceRoot: string;
  workspaceKey: string;
  workspacePath: string;
  branchName: string;
  baseBranch: string;
};

export type PreparedWorkspace = WorkspacePlan & {
  createdBranch: boolean;
  createdWorktree: boolean;
  reusedWorktree: boolean;
};

export type BranchStatus = {
  branchName: string;
  headSha: string;
  changedFiles: string[];
  dirty: boolean;
};

export function planWorkspace(input: {
  workspaceRoot: string;
  boardId: string;
  branchPrefix: string;
  baseBranch: string;
  card: Pick<CardRecord, "identifier" | "title">;
}): WorkspacePlan {
  const root = resolve(input.workspaceRoot);
  const key = workspaceKey(input.card.identifier);
  const workspacePath = resolve(root, input.boardId, key);
  assertPathInside(root, workspacePath);

  return {
    workspaceRoot: root,
    workspaceKey: key,
    workspacePath,
    branchName: buildBranchName(input.branchPrefix, input.card),
    baseBranch: input.baseBranch
  };
}

export function buildBranchName(
  branchPrefix: string,
  card: Pick<CardRecord, "identifier" | "title">
) {
  const identifier = card.identifier.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const slug = branchSlug(card.title) || "work";
  return `${branchPrefix}${identifier}-${slug}`;
}

export function prepareGitWorkspace(input: PrepareWorkspaceInput): PreparedWorkspace {
  const repoPath = resolve(input.repoPath);
  assertGitRepository(repoPath);
  assertBaseBranchExists(repoPath, input.baseBranch);

  if (!input.allowDirtyBaseRepo && isGitDirty(repoPath)) {
    throw new WorkspaceError("dirty_base_repo", `Base repository has uncommitted changes: ${repoPath}`);
  }

  const boardId = gitRepoName(repoPath);
  const plan = planWorkspace({
    workspaceRoot: input.workspaceRoot,
    boardId,
    branchPrefix: input.branchPrefix,
    baseBranch: input.baseBranch,
    card: input.card
  });

  assertNotSamePath(repoPath, plan.workspacePath);
  mkdirSync(dirname(plan.workspacePath), { recursive: true });

  const branchExists = gitRefExists(repoPath, plan.branchName);
  if (!branchExists) {
    runGit(repoPath, ["branch", plan.branchName, input.baseBranch]);
  }

  if (existsSync(plan.workspacePath)) {
    if (!input.reuseExisting) {
      throw new WorkspaceError("worktree_invalid", `Workspace already exists: ${plan.workspacePath}`);
    }
    validateExistingWorktree(plan.workspacePath, repoPath, plan.branchName);
    return {
      ...plan,
      createdBranch: !branchExists,
      createdWorktree: false,
      reusedWorktree: true
    };
  }

  runGit(repoPath, ["worktree", "add", plan.workspacePath, plan.branchName]);
  validateExistingWorktree(plan.workspacePath, repoPath, plan.branchName);

  return {
    ...plan,
    createdBranch: !branchExists,
    createdWorktree: true,
    reusedWorktree: false
  };
}

export function validateExistingWorktree(workspacePath: string, repoPath: string, branchName: string) {
  const workspace = resolve(workspacePath);

  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
    throw new WorkspaceError("worktree_invalid", `Workspace directory does not exist: ${workspace}`);
  }

  assertGitRepository(workspace);
  const root = runGit(workspace, ["rev-parse", "--show-toplevel"]);
  if (!samePath(root, workspace)) {
    throw new WorkspaceError("worktree_invalid", `Workspace root mismatch: ${workspace}`);
  }

  const branch = runGit(workspace, ["branch", "--show-current"]);
  if (branch !== branchName) {
    throw new WorkspaceError(
      "worktree_invalid",
      `Workspace branch mismatch: expected ${branchName}, got ${branch || "detached"}`
    );
  }

  const baseCommonDir = runGit(resolve(repoPath), ["rev-parse", "--git-common-dir"]);
  const workspaceCommonDir = runGit(workspace, ["rev-parse", "--git-common-dir"]);
  if (!samePath(resolve(repoPath, baseCommonDir), resolve(workspace, workspaceCommonDir))) {
    throw new WorkspaceError("worktree_invalid", "Workspace is not linked to the target repository");
  }
}

export function getBranchStatus(workspacePath: string): BranchStatus {
  const workspace = resolve(workspacePath);
  assertGitRepository(workspace);
  const branchName = runGit(workspace, ["branch", "--show-current"]);
  const headSha = runGit(workspace, ["rev-parse", "HEAD"]);
  const changedFiles = runGit(workspace, ["status", "--porcelain=v1"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((line) => {
      const renameParts = line.split(" -> ");
      return renameParts[renameParts.length - 1];
    });

  return {
    branchName,
    headSha,
    changedFiles,
    dirty: changedFiles.length > 0
  };
}

export function assertPathInside(rootPath: string, candidatePath: string) {
  const root = resolve(rootPath);
  const candidate = resolve(candidatePath);
  const pathDiff = relative(root, candidate);

  if (pathDiff === "" || (!pathDiff.startsWith("..") && !isAbsolute(pathDiff))) {
    return;
  }

  throw new WorkspaceError("workspace_escape", `Workspace path escapes root: ${candidate}`);
}

function assertNotSamePath(repoPath: string, workspacePath: string) {
  if (samePath(repoPath, workspacePath)) {
    throw new WorkspaceError("workspace_is_base_repo", "Workspace path cannot be the base repository checkout");
  }
}

function assertGitRepository(repoPath: string) {
  if (!existsSync(repoPath)) {
    throw new WorkspaceError("repo_not_found", `Repository path does not exist: ${repoPath}`);
  }

  try {
    runGit(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new WorkspaceError("repo_not_git", `Path is not a Git repository: ${repoPath}`);
  }
}

function assertBaseBranchExists(repoPath: string, baseBranch: string) {
  if (!gitRefExists(repoPath, baseBranch)) {
    throw new WorkspaceError("base_branch_missing", `Base branch does not exist: ${baseBranch}`);
  }
}

function gitRefExists(repoPath: string, refName: string) {
  try {
    runGit(repoPath, ["rev-parse", "--verify", "--quiet", refName]);
    return true;
  } catch {
    return false;
  }
}

function isGitDirty(repoPath: string) {
  return runGit(repoPath, ["status", "--porcelain=v1"]).trim().length > 0;
}

function gitRepoName(repoPath: string) {
  return workspaceKey(runGit(repoPath, ["rev-parse", "--show-toplevel"]).split(/[\\/]/).pop() ?? "repo");
}

function runGit(cwd: string, args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (error instanceof WorkspaceError) {
      throw error;
    }
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr)
        : "";
    throw new WorkspaceError(
      "git_command_failed",
      `git ${args.join(" ")} failed in ${cwd}${detail ? `: ${detail.trim()}` : ""}`
    );
  }
}

function realPath(path: string) {
  return existsSync(path) ? realpathSync.native(path) : resolve(path);
}

function samePath(left: string, right: string) {
  return realPath(left).toLowerCase() === realPath(right).toLowerCase();
}
