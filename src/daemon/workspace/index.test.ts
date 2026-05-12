import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertPathInside,
  buildBranchName,
  getBranchStatus,
  planWorkspace,
  prepareGitWorkspace,
  WorkspaceError
} from ".";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Git worktrees on Windows can hold files briefly after commands exit.
      }
    }
  }
});

test("planWorkspace maps a card to a stable contained workspace path", () => {
  const plan = planWorkspace({
    workspaceRoot: "C:/atelier-workspaces",
    boardId: "board-main",
    branchPrefix: "sonata/",
    baseBranch: "master",
    card: {
      identifier: "CARD 1: Auth",
      title: "Add Login Flow"
    } as never
  });

  expect(plan.workspaceKey).toBe("CARD_1_Auth");
  expect(plan.workspacePath).toBe("C:\\atelier-workspaces\\board-main\\CARD_1_Auth");
  expect(plan.branchName).toBe("sonata/card-1-auth-add-login-flow");
});

test("buildBranchName is deterministic and bounded", () => {
  expect(
    buildBranchName("sonata/", {
      identifier: "CARD-001",
      title: "Implement workspace safety!!! With a very long task name that should be clipped"
    } as never)
  ).toBe("sonata/card-001-implement-workspace-safety-with-a-very-long-task");
});

test("assertPathInside rejects workspace escape", () => {
  expect(() => assertPathInside("C:/root/workspaces", "C:/root/workspaces/board/card")).not.toThrow();
  expect(() => assertPathInside("C:/root/workspaces", "C:/root/other")).toThrow(WorkspaceError);
});

test("prepareGitWorkspace creates branch and worktree, then reuses it", () => {
  const { repoPath, workspaceRoot } = createGitFixture();
  const input = {
    repoPath,
    workspaceRoot,
    branchPrefix: "sonata/",
    baseBranch: "master",
    card: {
      identifier: "CARD-001",
      title: "Create worktree"
    } as never,
    reuseExisting: true,
    allowDirtyBaseRepo: false
  };

  const first = prepareGitWorkspace(input);
  expect(first).toMatchObject({
    branchName: "sonata/card-001-create-worktree",
    createdBranch: true,
    createdWorktree: true,
    reusedWorktree: false
  });
  expect(existsSync(first.workspacePath)).toBe(true);

  const second = prepareGitWorkspace(input);
  expect(second).toMatchObject({
    branchName: first.branchName,
    createdBranch: false,
    createdWorktree: false,
    reusedWorktree: true,
    workspacePath: first.workspacePath
  });
});

test("prepareGitWorkspace refuses dirty base repos when configured", () => {
  const { repoPath, workspaceRoot } = createGitFixture();
  writeFileSync(join(repoPath, "dirty.txt"), "dirty");

  expect(() =>
    prepareGitWorkspace({
      repoPath,
      workspaceRoot,
      branchPrefix: "sonata/",
      baseBranch: "master",
      card: {
        identifier: "CARD-002",
        title: "Dirty check"
      } as never,
      reuseExisting: true,
      allowDirtyBaseRepo: false
    })
  ).toThrow("Base repository has uncommitted changes");
});

test("prepareGitWorkspace validates base branch before creating worktree", () => {
  const { repoPath, workspaceRoot } = createGitFixture();

  expect(() =>
    prepareGitWorkspace({
      repoPath,
      workspaceRoot,
      branchPrefix: "sonata/",
      baseBranch: "missing",
      card: {
        identifier: "CARD-003",
        title: "Missing branch"
      } as never,
      reuseExisting: true,
      allowDirtyBaseRepo: false
    })
  ).toThrow("Base branch does not exist");
});

test("getBranchStatus reports changed files for PR packets", () => {
  const { repoPath, workspaceRoot } = createGitFixture();
  const prepared = prepareGitWorkspace({
    repoPath,
    workspaceRoot,
    branchPrefix: "sonata/",
    baseBranch: "master",
    card: {
      identifier: "CARD-004",
      title: "Status report"
    } as never,
    reuseExisting: true,
    allowDirtyBaseRepo: false
  });
  writeFileSync(join(prepared.workspacePath, "changed.txt"), "changed");

  expect(getBranchStatus(prepared.workspacePath)).toMatchObject({
    branchName: prepared.branchName,
    changedFiles: ["changed.txt"],
    dirty: true
  });
});

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "atelier-workspace-"));
  tempRoots.push(root);
  const repoPath = join(root, "repo");
  const workspaceRoot = join(root, "workspaces");
  mkdirSync(repoPath, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  git(repoPath, ["init", "-b", "master"]);
  git(repoPath, ["config", "user.email", "test@example.com"]);
  git(repoPath, ["config", "user.name", "Atelier Test"]);
  writeFileSync(join(repoPath, "README.md"), "# Test\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "initial"]);

  return { root, repoPath, workspaceRoot };
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
