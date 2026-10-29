import http from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createConfig } from "../src/config.js";
import { StubControlPlaneClient } from "../src/cp/client.js";
import { createHttpServer } from "../src/http/server.js";
import { signDiscordBody, TEST_PUBLIC_KEY } from "./helpers/discord-sign.js";

function getMetrics(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      reject(new Error("no address"));
      return;
    }
    http.get({ host: "127.0.0.1", port: addr.port, path: "/metrics" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

describe("GET /metrics", () => {
  const config = createConfig({
    discordPublicKey: TEST_PUBLIC_KEY,
    discordApplicationId: "417719114458901252",
    unsignedIpLimitPerMin: 1000,
    guildLimitPerMin: 1000,
    guildBurst: 1000,
    processRps: 1000,
  });

  let internalServer: http.Server;

  afterEach(() => {
    internalServer?.close();
  });

  it("exposes Prometheus text on the internal listener only", async () => {
    internalServer = createHttpServer({
      config,
      cp: new StubControlPlaneClient(),
      surface: "internal",
    });
    internalServer.listen(0);

    const body = JSON.stringify({ type: 1 });
    const ts = String(Math.floor(Date.now() / 1000));
    const { signature } = signDiscordBody(body, ts);

    const publicServer = createHttpServer({
      config,
      cp: new StubControlPlaneClient(),
      surface: "public",
    });
    await new Promise<void>((resolve) => publicServer.listen(0, resolve));
    const publicAddr = publicServer.address();
    if (!publicAddr || typeof publicAddr === "string") {
      throw new Error("no public address");
    }

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: publicAddr.port,
          method: "POST",
          path: "/interactions",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-Ed25519": signature,
            "X-Signature-Timestamp": ts,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const metrics = await getMetrics(internalServer);
    expect(metrics).toContain("ember_discord_signature_verify_total");
    expect(metrics).toContain('result="ok"');
    const publicMetrics = await new Promise<{ status: number }>((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port: publicAddr.port, path: "/metrics" }, (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0 });
        })
        .on("error", reject);
    });
    expect(publicMetrics.status).toBe(404);

    publicServer.close();
  });
});
