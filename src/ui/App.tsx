import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileText,
  KanbanSquare,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ApiEnvelope,
  BoardSnapshot,
  DaemonHealth,
  StoreArtifact,
  StoreCard,
  StoreRun
} from "../shared/contracts";

type ShellDaemonStatus = {
  reachable: boolean;
  endpoint: string;
  detail: string;
};

type PointerPosition = {
  x: number;
  y: number;
};

type GlowState = {
  intensity: number;
  position: {
    x: number;
    y: number;
  };
};

type UiColumn = {
  id: string;
  title: string;
  states: string[];
  cards: StoreCard[];
};

const fallbackSnapshot: BoardSnapshot = {
  boards: [],
  selectedBoard: null,
  cards: [
    {
      id: "demo-plan",
      boardId: "demo",
      identifier: "CARD-001",
      title: "Load workflow contract",
      description: "Read docs/orchestration/workflow.md and prepare a plan artifact before implementation.",
      acceptanceCriteria: ["Workflow loads", "Plan gate visible"],
      priority: 1,
      state: "Ready",
      stateNormalized: "ready",
      labels: ["workflow"],
      blockedBy: [],
      repoPath: null,
      branchName: null,
      planArtifactPath: null,
      prPacketPath: null,
      position: 0,
      createdAt: "",
      updatedAt: ""
    },
    {
      id: "demo-impl",
      boardId: "demo",
      identifier: "CARD-002",
      title: "Generate PR packet",
      description: "Collect changed files, checks, artifacts, risks, and local handoff notes.",
      acceptanceCriteria: ["Packet has branch", "No auto merge"],
      priority: 2,
      state: "Verifying",
      stateNormalized: "verifying",
      labels: ["handoff"],
      blockedBy: [],
      repoPath: null,
      branchName: "sonata/card-002-generate-pr-packet",
      planArtifactPath: "docs/exec-plans/active/CARD-002.md",
      prPacketPath: null,
      position: 0,
      createdAt: "",
      updatedAt: ""
    }
  ],
  runs: [],
  artifacts: []
};

export function App() {
  const [health, setHealth] = useState<DaemonHealth | null>(null);
  const [shellStatus, setShellStatus] = useState<ShellDaemonStatus | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot>(fallbackSnapshot);
  const [selectedCardId, setSelectedCardId] = useState<string>(fallbackSnapshot.cards[0]?.id ?? "");
  const [apiError, setApiError] = useState<string | null>(null);
  const pointerPosition = usePointerPosition();

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    const [daemonResult, shellResult, snapshotResult] = await Promise.allSettled([
      fetch("http://127.0.0.1:17345/health").then((response) => {
        if (!response.ok) {
          throw new Error(`Daemon returned HTTP ${response.status}`);
        }
        return response.json() as Promise<DaemonHealth>;
      }),
      invoke<ShellDaemonStatus>("daemon_status"),
      apiGet<BoardSnapshot>("/api/snapshot")
    ]);

    setHealth(daemonResult.status === "fulfilled" ? daemonResult.value : null);
    setShellStatus(shellResult.status === "fulfilled" ? shellResult.value : null);
    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
      setApiError(null);
      if (!snapshotResult.value.cards.some((card) => card.id === selectedCardId)) {
        setSelectedCardId(snapshotResult.value.cards[0]?.id ?? "");
      }
    } else {
      setApiError(snapshotResult.reason instanceof Error ? snapshotResult.reason.message : String(snapshotResult.reason));
    }
  }

  async function startRun(card: StoreCard, type: "plan" | "implement" | "verify" | "pr_packet") {
    try {
      await apiPost(`/api/cards/${card.id}/runs`, { type });
      await refreshStatus();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    }
  }

  const daemonOnline = Boolean(health?.ok || shellStatus?.reachable);
  const selectedCard = snapshot.cards.find((card) => card.id === selectedCardId) ?? snapshot.cards[0] ?? null;
  const selectedRuns = selectedCard ? snapshot.runs.filter((run) => run.cardId === selectedCard.id) : [];
  const selectedArtifacts = selectedCard ? snapshot.artifacts.filter((artifact) => artifact.cardId === selectedCard.id) : [];
  const columns = useMemo(() => buildColumns(snapshot.cards), [snapshot.cards]);
  const activeRuns = snapshot.runs.filter((run) => run.status === "queued" || run.status === "running");
  const blockedCards = snapshot.cards.filter((card) => ["blocked", "failed"].includes(card.stateNormalized));
  const prReadyCards = snapshot.cards.filter((card) => card.stateNormalized === "pr ready");

  return (
    <main className="app-shell">
      <div className="ambient-layer" aria-hidden="true" />
      <div className="cursor-glow" aria-hidden="true" style={cursorGlowStyle(pointerPosition)} />
      <section className="topbar" aria-label="Application status">
        <div>
          <p className="eyebrow">Sonata Orchestrator</p>
          <h1>Atelier</h1>
        </div>
        <div className="topbar-actions">
          <span className={daemonOnline ? "status-pill status-ready" : "status-pill status-blocked"}>
            {daemonOnline ? "Daemon online" : "Daemon offline"}
          </span>
          <button className="icon-button" type="button" onClick={() => void refreshStatus()}>
            <RefreshCw size={17} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      <section className="status-grid" aria-label="Runtime summary">
        <Metric
          icon={<KanbanSquare size={18} />}
          label="Cards"
          value={String(snapshot.cards.length)}
          detail={snapshot.selectedBoard?.name ?? "Local preview"}
          pointerPosition={pointerPosition}
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Plan gate"
          value="Required"
          detail="Implementation blocked until approval"
          pointerPosition={pointerPosition}
        />
        <Metric
          icon={<PlayCircle size={18} />}
          label="Active runs"
          value={String(activeRuns.length)}
          detail={activeRuns.length ? "Queue is occupied" : "Manual dispatch"}
          tone={activeRuns.length ? "ready" : "default"}
          pointerPosition={pointerPosition}
        />
        <Metric
          icon={<AlertTriangle size={18} />}
          label="Blocked"
          value={String(blockedCards.length)}
          detail={apiError ?? "No API errors"}
          tone={blockedCards.length || apiError ? "blocked" : "default"}
          pointerPosition={pointerPosition}
        />
      </section>

      <section className="workspace-layout" aria-label="Operator workspace">
        <section className="board" aria-label="Local board">
          {columns.map((column) => (
            <BoardColumnCard
              column={column}
              key={column.id}
              selectedCardId={selectedCard?.id ?? ""}
              onSelect={setSelectedCardId}
              pointerPosition={pointerPosition}
            />
          ))}
        </section>

        <aside className="detail-panel" aria-label="Card detail">
          {selectedCard ? (
            <CardDetail
              card={selectedCard}
              runs={selectedRuns}
              artifacts={selectedArtifacts}
              prReadyCount={prReadyCards.length}
              onStartRun={startRun}
              pointerPosition={pointerPosition}
            />
          ) : (
            <EmptyColumn pointerPosition={pointerPosition}>No card selected</EmptyColumn>
          )}
        </aside>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  pointerPosition,
  tone = "default"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  pointerPosition: PointerPosition | null;
  tone?: "default" | "ready" | "blocked";
}) {
  const { ref, style } = useProximityGlow<HTMLDivElement>(pointerPosition, 360);

  return (
    <div className={`metric metric-${tone}`} ref={ref} style={style}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function BoardColumnCard({
  column,
  selectedCardId,
  onSelect,
  pointerPosition
}: {
  column: UiColumn;
  selectedCardId: string;
  onSelect: (cardId: string) => void;
  pointerPosition: PointerPosition | null;
}) {
  const { ref, style } = useProximityGlow<HTMLElement>(pointerPosition, 420);

  return (
    <article className="column" ref={ref} style={style}>
      <header className="column-header">
        <h2>{column.title}</h2>
        <span>{column.cards.length}</span>
      </header>
      <div className="card-stack">
        {column.cards.length === 0 ? (
          <EmptyColumn pointerPosition={pointerPosition}>No cards</EmptyColumn>
        ) : (
          column.cards.map((card) => (
            <WorkCard
              key={card.id}
              selected={card.id === selectedCardId}
              pointerPosition={pointerPosition}
              onClick={() => onSelect(card.id)}
            >
              <div className="work-card-meta">
                <span>{card.identifier}</span>
                <span>{card.state}</span>
              </div>
              <p className="work-card-title">{card.title}</p>
              <p>{card.description || "No description"}</p>
              <div className="card-tags">
                {card.labels.slice(0, 3).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </WorkCard>
          ))
        )}
      </div>
    </article>
  );
}

function CardDetail({
  card,
  runs,
  artifacts,
  prReadyCount,
  onStartRun,
  pointerPosition
}: {
  card: StoreCard;
  runs: StoreRun[];
  artifacts: StoreArtifact[];
  prReadyCount: number;
  onStartRun: (card: StoreCard, type: "plan" | "implement" | "verify" | "pr_packet") => void;
  pointerPosition: PointerPosition | null;
}) {
  const { ref, style } = useProximityGlow<HTMLElement>(pointerPosition, 420);
  const approvedPlan = Boolean(card.planArtifactPath || artifacts.some((artifact) => artifact.kind === "plan" && artifact.status === "approved"));

  return (
    <article className="detail-card" ref={ref} style={style}>
      <header className="detail-header">
        <div>
          <p className="eyebrow">{card.identifier}</p>
          <h2>{card.title}</h2>
        </div>
        <span className="status-pill">{card.state}</span>
      </header>

      <p className="detail-copy">{card.description || "No description"}</p>

      <div className="action-row">
        <button className="icon-button" type="button" onClick={() => onStartRun(card, "plan")}>
          <FileText size={16} aria-hidden="true" />
          <span>Plan</span>
        </button>
        <button className="icon-button" type="button" onClick={() => onStartRun(card, "implement")}>
          <TerminalSquare size={16} aria-hidden="true" />
          <span>Implement</span>
        </button>
        <button className="icon-button" type="button" onClick={() => onStartRun(card, "pr_packet")}>
          <Archive size={16} aria-hidden="true" />
          <span>Packet</span>
        </button>
      </div>

      <section className={approvedPlan ? "gate gate-open" : "gate gate-closed"}>
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>{approvedPlan ? "Approved plan available" : "Plan approval required"}</span>
      </section>

      <InfoList
        title="Acceptance"
        empty="No criteria"
        items={card.acceptanceCriteria.map((criterion) => ({ id: criterion, label: criterion, meta: "pending" }))}
      />

      <InfoList
        title="Runs"
        empty="No run history"
        items={runs.slice(0, 6).map((run) => ({
          id: run.id,
          label: `${run.type} #${run.attempt}`,
          meta: `${run.status} · ${run.totalTokens} tokens`
        }))}
      />

      <InfoList
        title="Artifacts"
        empty="No artifacts"
        items={artifacts.slice(0, 6).map((artifact) => ({
          id: artifact.id,
          label: artifact.path,
          meta: `${artifact.kind} · ${artifact.status}`
        }))}
      />

      <section className="settings-strip">
        <span>{card.branchName ?? "No branch"}</span>
        <span>{card.prPacketPath ?? `${prReadyCount} packet ready`}</span>
      </section>
    </article>
  );
}

function InfoList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string; meta: string }>;
}) {
  return (
    <section className="info-list">
      <header>
        <h3>{title}</h3>
        <span>{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        items.map((item) => (
          <div className="info-row" key={item.id}>
            <span>{item.label}</span>
            <em>{item.meta}</em>
          </div>
        ))
      )}
    </section>
  );
}

function WorkCard({
  children,
  selected,
  onClick,
  pointerPosition
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  pointerPosition: PointerPosition | null;
}) {
  const { ref, style } = useProximityGlow<HTMLButtonElement>(pointerPosition, 360);

  return (
    <button className={selected ? "work-card work-card-selected" : "work-card"} ref={ref} style={style} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function EmptyColumn({
  children,
  pointerPosition
}: {
  children: React.ReactNode;
  pointerPosition: PointerPosition | null;
}) {
  const { ref, style } = useProximityGlow<HTMLParagraphElement>(pointerPosition, 320);

  return (
    <p className="empty-column" ref={ref} style={style}>
      {children}
    </p>
  );
}

function buildColumns(cards: StoreCard[]): UiColumn[] {
  const definitions = [
    { id: "queue", title: "Queue", states: ["Inbox", "Ready"] },
    { id: "plan", title: "Plan Gate", states: ["Planning", "Plan Review", "Approved"] },
    { id: "run", title: "Running", states: ["Implementing", "Verifying"] },
    { id: "handoff", title: "Handoff", states: ["PR Ready", "Blocked", "Failed", "Done"] }
  ];

  return definitions.map((definition) => {
    const stateSet = new Set(definition.states.map((state) => state.toLowerCase()));
    return {
      ...definition,
      cards: cards
        .filter((card) => stateSet.has(card.stateNormalized))
        .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999) || a.position - b.position || a.identifier.localeCompare(b.identifier))
    };
  });
}

async function apiGet<T>(path: string) {
  const response = await fetch(`http://127.0.0.1:17345${path}`);
  return unwrapApi<T>(response);
}

async function apiPost<T>(path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:17345${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
  return unwrapApi<T>(response);
}

async function unwrapApi<T>(response: Response) {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!payload.ok) {
    throw new Error(payload.error.message);
  }
  return payload.data;
}

function usePointerPosition() {
  const [pointerPosition, setPointerPosition] = useState<PointerPosition | null>(null);
  const frameRef = useRef<number | null>(null);
  const nextPositionRef = useRef<PointerPosition | null>(null);

  useEffect(() => {
    function commitPosition() {
      frameRef.current = null;
      setPointerPosition(nextPositionRef.current);
    }

    function schedulePosition(position: PointerPosition | null) {
      nextPositionRef.current = position;
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(commitPosition);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      schedulePosition({ x: event.clientX, y: event.clientY });
    }

    function handlePointerLeave() {
      schedulePosition(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return pointerPosition;
}

function useProximityGlow<TElement extends HTMLElement>(
  pointerPosition: PointerPosition | null,
  maxDistance: number
) {
  const ref = useRef<TElement | null>(null);
  const [glow, setGlow] = useState<GlowState>({
    intensity: 0,
    position: { x: 50, y: 50 }
  });

  useLayoutEffect(() => {
    if (!ref.current || !pointerPosition) {
      setGlow({ intensity: 0, position: { x: 50, y: 50 } });
      return;
    }

    setGlow(calculateProximityGlow(ref.current.getBoundingClientRect(), pointerPosition, maxDistance));
  }, [pointerPosition, maxDistance]);

  return {
    ref,
    style: {
      "--glow-intensity": glow.intensity.toFixed(3),
      "--glow-x": `${glow.position.x}%`,
      "--glow-y": `${glow.position.y}%`
    } as CSSProperties
  };
}

function calculateProximityGlow(
  elementRect: DOMRect,
  sourcePosition: PointerPosition,
  maxDistance: number
): GlowState {
  const centerX = elementRect.left + elementRect.width / 2;
  const centerY = elementRect.top + elementRect.height / 2;
  const dx = sourcePosition.x - centerX;
  const dy = sourcePosition.y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance >= maxDistance) {
    return { intensity: 0, position: { x: 50, y: 50 } };
  }

  const intensity = Math.pow(1 - distance / maxDistance, 1.5) * 0.8;
  const relX = ((sourcePosition.x - elementRect.left) / elementRect.width) * 100;
  const relY = ((sourcePosition.y - elementRect.top) / elementRect.height) * 100;

  return {
    intensity,
    position: {
      x: Math.max(-20, Math.min(120, relX)),
      y: Math.max(-20, Math.min(120, relY))
    }
  };
}

function cursorGlowStyle(pointerPosition: PointerPosition | null) {
  return {
    "--cursor-x": pointerPosition ? `${pointerPosition.x}px` : "50vw",
    "--cursor-y": pointerPosition ? `${pointerPosition.y}px` : "50vh",
    "--cursor-opacity": pointerPosition ? 1 : 0
  } as CSSProperties;
}
