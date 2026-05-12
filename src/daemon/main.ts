import { createApiContext, createAtelierApiFetch } from "./api";

const host = "127.0.0.1";
const port = Number(Bun.env.ATELIER_DAEMON_PORT ?? "17345");
const version = "0.1.0";

const context = createApiContext({ version });
const fetch = createAtelierApiFetch(context);

const server = Bun.serve({
  hostname: host,
  port,
  fetch
});

console.log(
  JSON.stringify({
    service: "atelier-daemon",
    status: "listening",
    endpoint: server.url.href
  })
);
