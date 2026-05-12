import { initializeStore } from "./store";
import type { DaemonHealth } from "../shared/contracts";

const host = "127.0.0.1";
const port = Number(Bun.env.ATELIER_DAEMON_PORT ?? "17345");
const version = "0.1.0";

const store = initializeStore();

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
      "content-type": "application/json",
      ...init.headers
    }
  });
}

const server = Bun.serve({
  hostname: host,
  port,
  fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    }

    if (url.pathname === "/health") {
      const health: DaemonHealth = {
        ok: true,
        service: "atelier-daemon",
        version,
        storeReady: store.ready
      };
      return json(health);
    }

    if (url.pathname === "/api/status") {
      return json({
        service: "atelier-daemon",
        version,
        endpoint: `http://${host}:${port}`,
        migrations: store.appliedMigrations
      });
    }

    return json({ error: "Not found" }, { status: 404 });
  }
});

console.log(
  JSON.stringify({
    service: "atelier-daemon",
    status: "listening",
    endpoint: server.url.href
  })
);
