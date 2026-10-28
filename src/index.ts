import { assertInteractionSecrets, loadConfig } from "./config.js";
import { HttpControlPlaneClient, StubControlPlaneClient } from "./cp/client.js";
import { createDiscordBotRest } from "./discord/bot-rest.js";
import { createHttpServer } from "./http/server.js";

const config = loadConfig();
assertInteractionSecrets(config);

const useStub = process.env.EMBER_DISCORD_CP_STUB === "1" || !config.cpServiceBearer;
const cp = useStub
  ? new StubControlPlaneClient()
  : new HttpControlPlaneClient(config.cpBaseUrl, config.cpServiceBearer);

const bot = config.discordBotToken ? createDiscordBotRest(config.discordBotToken) : undefined;

const publicServer = createHttpServer({ config, cp, surface: "public" });
const internalServer = createHttpServer({ config, cp, surface: "internal", bot });

publicServer.listen(config.port, config.publicHost, () => {
  console.info(
    `ember-discord-adapter public ${config.publicHost}:${config.port} cp_stub=${useStub}`,
  );
});

internalServer.listen(config.internalPort, config.internalHost, () => {
  console.info(`ember-discord-adapter internal ${config.internalHost}:${config.internalPort}`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.info(`shutdown ${signal}`);
  publicServer.stopAccepting?.();
  internalServer.stopAccepting?.();
  setTimeout(() => {
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending === 0) {
        process.exit(0);
      }
    };
    publicServer.close(done);
    internalServer.close(done);
  }, config.shutdownGraceMs).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
