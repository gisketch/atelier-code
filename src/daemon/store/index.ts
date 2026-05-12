import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BOARD_STATES = [
  { name: "Inbox", category: "active" },
  { name: "Ready", category: "active" },
  { name: "Planning", category: "active" },
  { name: "Plan Review", category: "active" },
  { name: "Approved", category: "active" },
  { name: "Implementing", category: "active" },
  { name: "Verifying", category: "active" },
  { name: "PR Ready", category: "active" },
  { name: "Blocked", category: "blocked" },
  { name: "Done", category: "terminal" },
  { name: "Failed", category: "failed" }
] as const;

export type BoardStateCategory = (typeof DEFAULT_BOARD_STATES)[number]["category"];

export type StoreBootstrap = {
  ready: boolean;
  appliedMigrations: string[];
  dbPath: string;
  appDataRoot: string;
};

export type StoreOptions = {
  dbPath?: string;
};

export type BoardRecord = {
  id: string;
  name: string;
  repoPath: string;
  workspaceRoot: string | null;
  workflowPath: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CardRecord = {
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

export type RunRecord = {
  id: string;
  boardId: string;
  cardId: string;
  type: "plan" | "implement" | "verify" | "pr_packet";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactRecord = {
  id: string;
  boardId: string;
  cardId: string | null;
  runId: string | null;
  kind: "plan" | "verification" | "pr_packet" | "log" | "other";
  path: string;
  status: "draft" | "approved" | "superseded" | "final";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RetryEntryRecord = {
  id: string;
  boardId: string;
  cardId: string;
  runId: string | null;
  runType: RunRecord["type"];
  attempt: number;
  nextAttemptAt: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventRecord = {
  id: string;
  boardId: string | null;
  cardId: string | null;
  runId: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type SettingRecord = {
  scope: "app" | "board";
  scopeId: string;
  key: string;
  value: unknown;
  updatedAt: string;
};

export type CreateBoardInput = {
  id?: string;
  name: string;
  repoPath: string;
  workspaceRoot?: string | null;
  workflowPath?: string;
};

export type CreateCardInput = {
  id?: string;
  boardId: string;
  identifier?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  priority?: number | null;
  state?: string;
  labels?: string[];
  position?: number;
};

export type CreateRunInput = {
  id?: string;
  boardId: string;
  cardId: string;
  type: RunRecord["type"];
  attempt?: number;
  status?: RunRecord["status"];
};

export type UpdateRunInput = {
  status?: RunRecord["status"];
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type CreateArtifactInput = {
  id?: string;
  boardId: string;
  cardId?: string | null;
  runId?: string | null;
  kind: ArtifactRecord["kind"];
  path: string;
  status?: ArtifactRecord["status"];
  metadata?: Record<string, unknown>;
};

const currentDir = dirname(fileURLToPath(import.meta.url));

export function resolveAppDataRoot(env: Record<string, string | undefined> = Bun.env, cwd = process.cwd()) {
  if (env.ATELIER_APP_DATA) return env.ATELIER_APP_DATA;
  if (env.APPDATA) return join(env.APPDATA, "Atelier");
  if (env.XDG_DATA_HOME) return join(env.XDG_DATA_HOME, "atelier");
  if (env.HOME) return join(env.HOME, ".local", "share", "atelier");
  return join(cwd, ".atelier");
}

export function defaultStorePath(env: Record<string, string | undefined> = Bun.env, cwd = process.cwd()) {
  return join(resolveAppDataRoot(env, cwd), "atelier.sqlite");
}

export function initializeStore(options: StoreOptions = {}): StoreBootstrap {
  const appDataRoot = resolveAppDataRoot();
  const dbPath = options.dbPath ?? Bun.env.ATELIER_DB_PATH ?? join(appDataRoot, "atelier.sqlite");
  const store = openStore({ dbPath });
  const appliedMigrations = store.appliedMigrations;
  store.close();

  return {
    ready: true,
    appliedMigrations,
    dbPath,
    appDataRoot
  };
}

export function openStore(options: StoreOptions = {}) {
  const dbPath = options.dbPath ?? Bun.env.ATELIER_DB_PATH ?? defaultStorePath();
  const dbDir = dirname(dbPath);

  if (dbPath !== ":memory:" && !existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return new AtelierStore(new Database(dbPath), dbPath);
}

export function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeLabel(value: string) {
  return normalizeName(value);
}

export function workspaceKey(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function branchSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.slice(0, 48);
}

class AtelierStore {
  readonly appliedMigrations: string[];

  constructor(
    private readonly db: Database,
    readonly dbPath: string
  ) {
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.appliedMigrations = runMigrations(this.db);
  }

  close() {
    this.db.close();
  }

  createBoard(input: CreateBoardInput): BoardRecord {
    const id = input.id ?? crypto.randomUUID();
    const workflowPath = input.workflowPath ?? "docs/orchestration/workflow.md";

    const insert = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO boards (id, name, repo_path, workspace_root, workflow_path)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, input.name, input.repoPath, input.workspaceRoot ?? null, workflowPath);

      const insertState = this.db.query(
        `INSERT INTO board_states (board_id, name, normalized_name, position, category)
         VALUES (?, ?, ?, ?, ?)`
      );

      DEFAULT_BOARD_STATES.forEach((state, index) => {
        insertState.run(id, state.name, normalizeName(state.name), index, state.category);
      });
    });

    insert();
    return mustFind(this.getBoard(id), `Board not found after create: ${id}`);
  }

  getBoard(id: string): BoardRecord | null {
    const row = this.db.query<BoardRow, [string]>("SELECT * FROM boards WHERE id = ?").get(id);
    return row ? mapBoard(row) : null;
  }

  listBoards(): BoardRecord[] {
    return this.db.query<BoardRow, []>("SELECT * FROM boards ORDER BY created_at, id").all().map(mapBoard);
  }

  createCard(input: CreateCardInput): CardRecord {
    const id = input.id ?? crypto.randomUUID();
    const state = input.state ?? "Inbox";
    const stateNormalized = normalizeName(state);
    const identifier = input.identifier ?? nextCardIdentifier(this.db, input.boardId);
    const labels = [...new Set((input.labels ?? []).map(normalizeLabel).filter(Boolean))];

    this.db
      .query(
        `INSERT INTO cards (
          id, board_id, identifier, title, description, acceptance_criteria_json,
          priority, state, state_normalized, labels_json, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.boardId,
        identifier,
        input.title,
        input.description ?? "",
        JSON.stringify(input.acceptanceCriteria ?? []),
        input.priority ?? null,
        state,
        stateNormalized,
        JSON.stringify(labels),
        input.position ?? nextCardPosition(this.db, input.boardId, stateNormalized)
      );

    return mustFind(this.getCard(id), `Card not found after create: ${id}`);
  }

  getCard(id: string): CardRecord | null {
    const row = this.db.query<CardRow, [string]>("SELECT * FROM cards WHERE id = ?").get(id);
    return row ? mapCard(row) : null;
  }

  listCards(boardId: string): CardRecord[] {
    return this.db
      .query<CardRow, [string]>(
        `SELECT * FROM cards
         WHERE board_id = ?
         ORDER BY state_normalized, position, created_at, identifier`
      )
      .all(boardId)
      .map(mapCard);
  }

  moveCard(cardId: string, state: string, position: number): CardRecord {
    const stateNormalized = normalizeName(state);
    const updated = this.db
      .query(
        `UPDATE cards
         SET state = ?, state_normalized = ?, position = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(state, stateNormalized, position, cardId);

    if (updated.changes === 0) {
      throw new Error(`Card not found: ${cardId}`);
    }

    return mustFind(this.getCard(cardId), `Card not found after move: ${cardId}`);
  }

  updateCard(cardId: string, input: Partial<Pick<CardRecord, "branchName" | "planArtifactPath" | "prPacketPath">>): CardRecord {
    const current = mustFind(this.getCard(cardId), `Card not found: ${cardId}`);
    this.db
      .query(
        `UPDATE cards
         SET branch_name = ?, plan_artifact_path = ?, pr_packet_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        input.branchName ?? current.branchName,
        input.planArtifactPath ?? current.planArtifactPath,
        input.prPacketPath ?? current.prPacketPath,
        cardId
      );

    return mustFind(this.getCard(cardId), `Card not found after update: ${cardId}`);
  }

  createRun(input: CreateRunInput): RunRecord {
    const id = input.id ?? crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO runs (id, board_id, card_id, type, status, attempt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.boardId, input.cardId, input.type, input.status ?? "queued", input.attempt ?? 1);

    return mustFind(this.getRun(id), `Run not found after create: ${id}`);
  }

  getRun(id: string): RunRecord | null {
    const row = this.db.query<RunRow, [string]>("SELECT * FROM runs WHERE id = ?").get(id);
    return row ? mapRun(row) : null;
  }

  listRuns(input: { boardId?: string; cardId?: string } = {}): RunRecord[] {
    if (input.cardId) {
      return this.db
        .query<RunRow, [string]>("SELECT * FROM runs WHERE card_id = ? ORDER BY created_at DESC, id DESC")
        .all(input.cardId)
        .map(mapRun);
    }
    if (input.boardId) {
      return this.db
        .query<RunRow, [string]>("SELECT * FROM runs WHERE board_id = ? ORDER BY created_at DESC, id DESC")
        .all(input.boardId)
        .map(mapRun);
    }
    return this.db.query<RunRow, []>("SELECT * FROM runs ORDER BY created_at DESC, id DESC").all().map(mapRun);
  }

  updateRun(runId: string, input: UpdateRunInput): RunRecord {
    const current = mustFind(this.getRun(runId), `Run not found: ${runId}`);
    this.db
      .query(
        `UPDATE runs
         SET status = ?, started_at = ?, finished_at = ?, error = ?,
             input_tokens = ?, output_tokens = ?, total_tokens = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        input.status ?? current.status,
        input.startedAt === undefined ? current.startedAt : input.startedAt,
        input.finishedAt === undefined ? current.finishedAt : input.finishedAt,
        input.error === undefined ? current.error : input.error,
        input.inputTokens ?? current.inputTokens,
        input.outputTokens ?? current.outputTokens,
        input.totalTokens ?? current.totalTokens,
        runId
      );

    return mustFind(this.getRun(runId), `Run not found after update: ${runId}`);
  }

  markActiveRunsInterrupted() {
    const rows = this.db
      .query<RunRow, []>("SELECT * FROM runs WHERE status IN ('queued', 'running') ORDER BY created_at")
      .all();
    const now = new Date().toISOString();
    const update = this.db.query(
      `UPDATE runs
       SET status = 'interrupted', finished_at = ?, error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    for (const row of rows) {
      update.run(now, "Interrupted by orchestrator restart", row.id);
      this.appendEvent({
        boardId: row.board_id,
        cardId: row.card_id,
        runId: row.id,
        type: "run_interrupted",
        payload: { previousStatus: row.status }
      });
    }

    return rows.map(mapRun);
  }

  createArtifact(input: CreateArtifactInput): ArtifactRecord {
    const id = input.id ?? crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO artifacts (id, board_id, card_id, run_id, kind, path, status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.boardId,
        input.cardId ?? null,
        input.runId ?? null,
        input.kind,
        input.path,
        input.status ?? "draft",
        JSON.stringify(input.metadata ?? {})
      );

    return mustFind(this.getArtifact(id), `Artifact not found after create: ${id}`);
  }

  getArtifact(id: string): ArtifactRecord | null {
    const row = this.db.query<ArtifactRow, [string]>("SELECT * FROM artifacts WHERE id = ?").get(id);
    return row ? mapArtifact(row) : null;
  }

  listArtifacts(input: { boardId?: string; cardId?: string; runId?: string } = {}): ArtifactRecord[] {
    if (input.runId) {
      return this.db
        .query<ArtifactRow, [string]>("SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at DESC, id DESC")
        .all(input.runId)
        .map(mapArtifact);
    }
    if (input.cardId) {
      return this.db
        .query<ArtifactRow, [string]>("SELECT * FROM artifacts WHERE card_id = ? ORDER BY created_at DESC, id DESC")
        .all(input.cardId)
        .map(mapArtifact);
    }
    if (input.boardId) {
      return this.db
        .query<ArtifactRow, [string]>("SELECT * FROM artifacts WHERE board_id = ? ORDER BY created_at DESC, id DESC")
        .all(input.boardId)
        .map(mapArtifact);
    }
    return this.db.query<ArtifactRow, []>("SELECT * FROM artifacts ORDER BY created_at DESC, id DESC").all().map(mapArtifact);
  }

  approveArtifact(artifactId: string, metadata: Record<string, unknown>): ArtifactRecord {
    const current = mustFind(this.getArtifact(artifactId), `Artifact not found: ${artifactId}`);
    this.db
      .query(
        `UPDATE artifacts
         SET status = 'approved', metadata_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(JSON.stringify({ ...current.metadata, ...metadata }), artifactId);

    return mustFind(this.getArtifact(artifactId), `Artifact not found after approve: ${artifactId}`);
  }

  upsertRetryEntry(input: {
    id?: string;
    boardId: string;
    cardId: string;
    runId?: string | null;
    runType: RunRecord["type"];
    attempt: number;
    nextAttemptAt: string;
    error?: string | null;
  }): RetryEntryRecord {
    this.db
      .query("DELETE FROM retry_entries WHERE card_id = ? AND run_type = ?")
      .run(input.cardId, input.runType);

    const id = input.id ?? crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO retry_entries (id, board_id, card_id, run_id, run_type, attempt, next_attempt_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.boardId,
        input.cardId,
        input.runId ?? null,
        input.runType,
        input.attempt,
        input.nextAttemptAt,
        input.error ?? null
      );

    return mustFind(this.getRetryEntry(id), `Retry entry not found after create: ${id}`);
  }

  getRetryEntry(id: string): RetryEntryRecord | null {
    const row = this.db.query<RetryEntryRow, [string]>("SELECT * FROM retry_entries WHERE id = ?").get(id);
    return row ? mapRetryEntry(row) : null;
  }

  listRetryEntries(boardId: string): RetryEntryRecord[] {
    return this.db
      .query<RetryEntryRow, [string]>("SELECT * FROM retry_entries WHERE board_id = ? ORDER BY next_attempt_at")
      .all(boardId)
      .map(mapRetryEntry);
  }

  appendEvent(input: {
    id?: string;
    boardId?: string | null;
    cardId?: string | null;
    runId?: string | null;
    type: string;
    payload?: unknown;
  }) {
    const id = input.id ?? crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO event_history (id, board_id, card_id, run_id, type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.boardId ?? null,
        input.cardId ?? null,
        input.runId ?? null,
        input.type,
        JSON.stringify(input.payload ?? {})
      );

    return id;
  }

  listEvents(input: { boardId?: string; cardId?: string; runId?: string; limit?: number } = {}): EventRecord[] {
    const limit = input.limit ?? 100;
    if (input.runId) {
      return this.db
        .query<EventRow, [string, number]>("SELECT * FROM event_history WHERE run_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(input.runId, limit)
        .map(mapEvent);
    }
    if (input.cardId) {
      return this.db
        .query<EventRow, [string, number]>("SELECT * FROM event_history WHERE card_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(input.cardId, limit)
        .map(mapEvent);
    }
    if (input.boardId) {
      return this.db
        .query<EventRow, [string, number]>("SELECT * FROM event_history WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(input.boardId, limit)
        .map(mapEvent);
    }
    return this.db
      .query<EventRow, [number]>("SELECT * FROM event_history ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(limit)
      .map(mapEvent);
  }

  setSetting(input: { scope?: "app" | "board"; scopeId?: string; key: string; value: unknown }): SettingRecord {
    const scope = input.scope ?? "app";
    const scopeId = input.scopeId ?? "";
    this.db
      .query(
        `INSERT INTO settings (scope, scope_id, key, value_json, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(scope, scope_id, key)
         DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
      )
      .run(scope, scopeId, input.key, JSON.stringify(input.value));

    return mustFind(this.getSetting(scope, scopeId, input.key), `Setting not found after set: ${input.key}`);
  }

  getSetting(scope: "app" | "board", scopeId: string, key: string): SettingRecord | null {
    const row = this.db
      .query<SettingRow, [string, string, string]>("SELECT * FROM settings WHERE scope = ? AND scope_id = ? AND key = ?")
      .get(scope, scopeId, key);
    return row ? mapSetting(row) : null;
  }

  listSettings(input: { scope?: "app" | "board"; scopeId?: string } = {}): SettingRecord[] {
    if (input.scope) {
      return this.db
        .query<SettingRow, [string, string]>("SELECT * FROM settings WHERE scope = ? AND scope_id = ? ORDER BY key")
        .all(input.scope, input.scopeId ?? "")
        .map(mapSetting);
    }
    return this.db.query<SettingRow, []>("SELECT * FROM settings ORDER BY scope, scope_id, key").all().map(mapSetting);
  }

  rawForTests() {
    return this.db;
  }
}

function runMigrations(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = join(currentDir, "migrations");
  const applied: string[] = [];

  for (const migration of readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()) {
    const existing = db
      .query<{ name: string }, [string]>("SELECT name FROM schema_migrations WHERE name = ?")
      .get(migration);

    if (existing) {
      applied.push(migration);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, migration), "utf8");
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.query("INSERT INTO schema_migrations (name) VALUES (?)").run(migration);
    });

    applyMigration();
    applied.push(migration);
  }

  return applied;
}

function nextCardIdentifier(db: Database, boardId: string) {
  const row = db
    .query<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM cards WHERE board_id = ?")
    .get(boardId);

  return `CARD-${String((row?.count ?? 0) + 1).padStart(3, "0")}`;
}

function nextCardPosition(db: Database, boardId: string, stateNormalized: string) {
  const row = db
    .query<{ max_position: number | null }, [string, string]>(
      "SELECT MAX(position) AS max_position FROM cards WHERE board_id = ? AND state_normalized = ?"
    )
    .get(boardId, stateNormalized);

  return (row?.max_position ?? -1) + 1;
}

function mustFind<T>(value: T | null, message: string) {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

type BoardRow = {
  id: string;
  name: string;
  repo_path: string;
  workspace_root: string | null;
  workflow_path: string;
  active: number;
  created_at: string;
  updated_at: string;
};

type CardRow = {
  id: string;
  board_id: string;
  identifier: string;
  title: string;
  description: string;
  acceptance_criteria_json: string;
  priority: number | null;
  state: string;
  state_normalized: string;
  labels_json: string;
  blocked_by_json: string;
  repo_path: string | null;
  branch_name: string | null;
  plan_artifact_path: string | null;
  pr_packet_path: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  board_id: string;
  card_id: string;
  type: RunRecord["type"];
  status: RunRecord["status"];
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
};

type ArtifactRow = {
  id: string;
  board_id: string;
  card_id: string | null;
  run_id: string | null;
  kind: ArtifactRecord["kind"];
  path: string;
  status: ArtifactRecord["status"];
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

type RetryEntryRow = {
  id: string;
  board_id: string;
  card_id: string;
  run_id: string | null;
  run_type: RunRecord["type"];
  attempt: number;
  next_attempt_at: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  board_id: string | null;
  card_id: string | null;
  run_id: string | null;
  type: string;
  payload_json: string;
  created_at: string;
};

type SettingRow = {
  scope: "app" | "board";
  scope_id: string;
  key: string;
  value_json: string;
  updated_at: string;
};

function mapBoard(row: BoardRow): BoardRecord {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    workspaceRoot: row.workspace_root,
    workflowPath: row.workflow_path,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCard(row: CardRow): CardRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    acceptanceCriteria: JSON.parse(row.acceptance_criteria_json) as string[],
    priority: row.priority,
    state: row.state,
    stateNormalized: row.state_normalized,
    labels: JSON.parse(row.labels_json) as string[],
    blockedBy: JSON.parse(row.blocked_by_json) as unknown[],
    repoPath: row.repo_path,
    branchName: row.branch_name,
    planArtifactPath: row.plan_artifact_path,
    prPacketPath: row.pr_packet_path,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    type: row.type,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    runId: row.run_id,
    kind: row.kind,
    path: row.path,
    status: row.status,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRetryEntry(row: RetryEntryRow): RetryEntryRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    runId: row.run_id,
    runType: row.run_type,
    attempt: row.attempt,
    nextAttemptAt: row.next_attempt_at,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    runId: row.run_id,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at
  };
}

function mapSetting(row: SettingRow): SettingRecord {
  return {
    scope: row.scope,
    scopeId: row.scope_id,
    key: row.key,
    value: JSON.parse(row.value_json) as unknown,
    updatedAt: row.updated_at
  };
}
