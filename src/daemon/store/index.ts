import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type StoreBootstrap = {
  ready: boolean;
  appliedMigrations: string[];
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = join(process.cwd(), ".atelier", "atelier.sqlite");

export function initializeStore(): StoreBootstrap {
  const dbPath = Bun.env.ATELIER_DB_PATH ?? defaultDbPath;
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
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

  db.close();

  return {
    ready: true,
    appliedMigrations: applied
  };
}

