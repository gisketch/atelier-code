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

