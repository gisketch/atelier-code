export type DaemonHealth = {
  ok: boolean;
  service: "atelier-daemon";
  version: string;
  storeReady: boolean;
};

export type BoardColumnId = "backlog" | "planned" | "running" | "review";

export type BoardCard = {
  id: string;
  title: string;
  status: BoardColumnId;
  summary: string;
};

export type BoardColumn = {
  id: BoardColumnId;
  title: string;
  cards: BoardCard[];
};

export type OrchestratorBoardState =
  | "Inbox"
  | "Ready"
  | "Planning"
  | "Plan Review"
  | "Approved"
  | "Implementing"
  | "Verifying"
  | "PR Ready"
  | "Blocked"
  | "Done"
  | "Failed";

export type RunType = "plan" | "implement" | "verify" | "pr_packet";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ArtifactKind = "plan" | "verification" | "pr_packet" | "log" | "other";

export type StoreBoard = {
  id: string;
  name: string;
  repoPath: string;
  workspaceRoot: string | null;
  workflowPath: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoreCard = {
  id: string;
  boardId: string;
  identifier: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number | null;
  state: string;
  stateNormalized: string;
  labels: string[];
  blockedBy: unknown[];
  repoPath: string | null;
  branchName: string | null;
  planArtifactPath: string | null;
  prPacketPath: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};
