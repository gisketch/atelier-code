import { invoke } from "@tauri-apps/api/core";
import { Activity, KanbanSquare, PlayCircle, ShieldCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BoardColumn, DaemonHealth } from "../shared/contracts";

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
  const pointerPosition = usePointerPosition();

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
      <div className="ambient-layer" aria-hidden="true" />
      <div className="cursor-glow" aria-hidden="true" style={cursorGlowStyle(pointerPosition)} />
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
        <Metric
          icon={<KanbanSquare size={18} />}
          label="Cards"
          value={String(totalCards)}
          detail="Active local workflow"
          pointerPosition={pointerPosition}
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Plan gate"
          value="Required"
          detail="Harness enforced"
          pointerPosition={pointerPosition}
        />
        <Metric
          icon={<PlayCircle size={18} />}
          label="Daemon"
          value={daemonOnline ? "Connected" : "Offline"}
          detail={daemonOnline ? "Runtime available" : "Shell only"}
          tone={daemonOnline ? "ready" : "blocked"}
          pointerPosition={pointerPosition}
        />
      </section>

      <section className="board" aria-label="Local board">
        {columns.map((column) => (
          <BoardColumnCard column={column} key={column.id} pointerPosition={pointerPosition} />
        ))}
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
  pointerPosition
}: {
  column: BoardColumn;
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
          <EmptyColumn pointerPosition={pointerPosition} />
        ) : (
          column.cards.map((card) => (
            <WorkCard key={card.id} pointerPosition={pointerPosition}>
              <p className="work-card-title">{card.title}</p>
              <p>{card.summary}</p>
            </WorkCard>
          ))
        )}
      </div>
    </article>
  );
}

function WorkCard({
  children,
  pointerPosition
}: {
  children: React.ReactNode;
  pointerPosition: PointerPosition | null;
}) {
  const { ref, style } = useProximityGlow<HTMLDivElement>(pointerPosition, 360);

  return (
    <div className="work-card" ref={ref} style={style}>
      {children}
    </div>
  );
}

function EmptyColumn({ pointerPosition }: { pointerPosition: PointerPosition | null }) {
  const { ref, style } = useProximityGlow<HTMLParagraphElement>(pointerPosition, 320);

  return (
    <p className="empty-column" ref={ref} style={style}>
      No cards
    </p>
  );
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

