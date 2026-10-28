import { assertInteractionSecrets, loadConfig } from "./config.js";
import { HttpControlPlaneClient, StubControlPlaneClient } from "./cp/client.js";
import { createHttpServer } from "./http/server.js";

const config = loadConfig();
assertInteractionSecrets(config);

const useStub = process.env.EMBER_DISCORD_CP_STUB === "1" || !config.cpServiceBearer;
const cp = useStub
  ? new StubControlPlaneClient()
  : new HttpControlPlaneClient(config.cpBaseUrl, config.cpServiceBearer);

const server = createHttpServer({ config, cp });

server.listen(config.port, () => {
  console.info(`ember-discord-adapter listening on ${config.port} cp_stub=${useStub}`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.info(`shutdown ${signal}`);
  server.stopAccepting?.();
  setTimeout(() => {
    server.close(() => process.exit(0));
  }, config.shutdownGraceMs).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
