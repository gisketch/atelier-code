import { invoke } from "@tauri-apps/api/core";
import { Activity, KanbanSquare, PlayCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BoardColumn, DaemonHealth } from "../shared/contracts";

type ShellDaemonStatus = {
  reachable: boolean;
  endpoint: string;
  detail: string;
};

const columns: BoardColumn[] = [
  {
    id: "backlog",
    title: "Backlog",
    cards: [
      {
        id: "card-spec",
        title: "Load workflow contract",
        status: "backlog",
        summary: "Read docs/orchestration/workflow.md from the target repo."
      }
    ]
  },
  {
    id: "planned",
    title: "Planned",
    cards: [
      {
        id: "card-plan",
        title: "Plan gate",
        status: "planned",
        summary: "Block implementation until an approved plan artifact exists."
      }
    ]
  },
  {
    id: "running",
    title: "Running",
    cards: []
  },
  {
    id: "review",
    title: "Review",
    cards: [
      {
        id: "card-pr",
        title: "PR packet",
        status: "review",
        summary: "Prepare local review notes, checks, changed files, and risks."
      }
    ]
  }
];

export function App() {
  const [health, setHealth] = useState<DaemonHealth | null>(null);
  const [shellStatus, setShellStatus] = useState<ShellDaemonStatus | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    const [daemonResult, shellResult] = await Promise.allSettled([
      fetch("http://127.0.0.1:17345/health").then((response) => {
        if (!response.ok) {
          throw new Error(`Daemon returned HTTP ${response.status}`);
        }
        return response.json() as Promise<DaemonHealth>;
      }),
      invoke<ShellDaemonStatus>("daemon_status")
    ]);

    setHealth(daemonResult.status === "fulfilled" ? daemonResult.value : null);
    setShellStatus(shellResult.status === "fulfilled" ? shellResult.value : null);
  }

  const totalCards = useMemo(
    () => columns.reduce((sum, column) => sum + column.cards.length, 0),
    []
  );

  const daemonOnline = Boolean(health?.ok || shellStatus?.reachable);

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Application status">
        <div>
          <p className="eyebrow">Sonata Orchestrator</p>
          <h1>Atelier</h1>
        </div>
        <button className="icon-button" type="button" onClick={() => void refreshStatus()}>
          <Activity size={18} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </section>

      <section className="status-grid" aria-label="Runtime summary">
        <Metric icon={<KanbanSquare size={18} />} label="Cards" value={String(totalCards)} />
        <Metric icon={<ShieldCheck size={18} />} label="Plan gate" value="Required" />
        <Metric
          icon={<PlayCircle size={18} />}
          label="Daemon"
          value={daemonOnline ? "Connected" : "Offline"}
          tone={daemonOnline ? "ready" : "blocked"}
        />
      </section>

      <section className="board" aria-label="Local board">
        {columns.map((column) => (
          <article className="column" key={column.id}>
            <header className="column-header">
              <h2>{column.title}</h2>
              <span>{column.cards.length}</span>
            </header>
            <div className="card-stack">
              {column.cards.length === 0 ? (
                <p className="empty-column">No cards</p>
              ) : (
                column.cards.map((card) => (
                  <div className="work-card" key={card.id}>
                    <p className="work-card-title">{card.title}</p>
                    <p>{card.summary}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "default"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "ready" | "blocked";
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

