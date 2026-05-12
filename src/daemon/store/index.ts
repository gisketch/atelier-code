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

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = join(process.cwd(), ".atelier", "atelier.sqlite");

export function initializeStore(options: StoreOptions = {}): StoreBootstrap {
  const dbPath = options.dbPath ?? Bun.env.ATELIER_DB_PATH ?? defaultDbPath;
  const store = openStore({ dbPath });
  const appliedMigrations = store.appliedMigrations;
  store.close();

  return {
    ready: true,
    appliedMigrations,
    dbPath
  };
}

export function openStore(options: StoreOptions = {}) {
  const dbPath = options.dbPath ?? Bun.env.ATELIER_DB_PATH ?? defaultDbPath;
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
