PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  workspace_root TEXT,
  workflow_path TEXT NOT NULL DEFAULT 'docs/orchestration/workflow.md',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS board_states (
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'active' CHECK (category IN ('active', 'blocked', 'failed', 'terminal')),
  PRIMARY KEY (board_id, normalized_name),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER,
  state TEXT NOT NULL,
  state_normalized TEXT NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '[]',
  blocked_by_json TEXT NOT NULL DEFAULT '[]',
  repo_path TEXT,
  branch_name TEXT,
  plan_artifact_path TEXT,
  pr_packet_path TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (board_id, identifier),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id, state_normalized) REFERENCES board_states(board_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_cards_board_state_position
ON cards(board_id, state_normalized, position, created_at);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('plan', 'implement', 'verify', 'pr_packet')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_card_created
ON runs(card_id, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  card_id TEXT,
  run_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('plan', 'verification', 'pr_packet', 'log', 'other')),
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded', 'final')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  scope TEXT NOT NULL CHECK (scope IN ('app', 'board')),
  scope_id TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, scope_id, key)
);

CREATE TABLE IF NOT EXISTS event_history (
  id TEXT PRIMARY KEY,
  board_id TEXT,
  card_id TEXT,
  run_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_history_board_created
ON event_history(board_id, created_at);

CREATE TRIGGER IF NOT EXISTS event_history_no_update
BEFORE UPDATE ON event_history
BEGIN
  SELECT RAISE(ABORT, 'event_history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS event_history_no_delete
BEFORE DELETE ON event_history
BEGIN
  SELECT RAISE(ABORT, 'event_history is append-only');
END;

CREATE TABLE IF NOT EXISTS token_totals (
  scope TEXT NOT NULL CHECK (scope IN ('board', 'card', 'run')),
  scope_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, scope_id)
);

CREATE TABLE IF NOT EXISTS retry_entries (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  run_id TEXT,
  run_type TEXT NOT NULL CHECK (run_type IN ('plan', 'implement', 'verify', 'pr_packet')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  next_attempt_at TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS live_session_snapshots (
  session_id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  thread_id TEXT,
  turn_id TEXT,
  last_codex_timestamp TEXT,
  last_codex_message TEXT NOT NULL DEFAULT '',
  codex_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (codex_input_tokens >= 0),
  codex_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (codex_output_tokens >= 0),
  codex_total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (codex_total_tokens >= 0),
  turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);
