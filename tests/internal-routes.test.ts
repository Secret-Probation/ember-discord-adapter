import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createConfig } from "../src/config.js";
import { StubControlPlaneClient } from "../src/cp/client.js";
import type { DiscordBotRest } from "../src/discord/bot-rest.js";
import { createHttpServer } from "../src/http/server.js";
import { timingSafeBearerMatch } from "../src/security/bearer-auth.js";

const GUILD_ID = "417719114458901252";

function request(
  server: http.Server,
  opts: { method: string; path: string; headers?: Record<string, string> },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      reject(new Error("no address"));
      return;
    }
    const req = http.request(
      {
        host: "127.0.0.1",
        port: addr.port,
        method: opts.method,
        path: opts.path,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("timingSafeBearerMatch", () => {
  it("accepts valid bearer and rejects wrong secret", () => {
    expect(timingSafeBearerMatch("Bearer secret-token", "secret-token")).toBe(true);
    expect(timingSafeBearerMatch("Bearer wrong", "secret-token")).toBe(false);
    expect(timingSafeBearerMatch(null, "secret-token")).toBe(false);
  });
});

describe("internal guild routes", () => {
  const internalToken = "test-internal-token";
  const config = createConfig({
    adapterInternalToken: internalToken,
    discordPublicKey: "",
    discordApplicationId: "417719114458901252",
  });

  let publicServer: http.Server;
  let internalServer: http.Server;
  let bot: DiscordBotRest;

  afterEach(() => {
    publicServer?.close();
    internalServer?.close();
  });

  function startServers(): void {
    bot = {
      leaveGuild: vi.fn().mockResolvedValue({ ok: true }),
      getGuild: vi.fn().mockResolvedValue({ ok: true, name: "Test Guild" }),
      listGuildRoles: vi.fn().mockResolvedValue({
        ok: true,
        roles: [
          { id: "111", name: "Admin" },
          { id: "222", name: "Member" },
        ],
      }),
    };
    const cp = new StubControlPlaneClient();
    publicServer = createHttpServer({ config, cp, surface: "public" });
    internalServer = createHttpServer({ config, cp, surface: "internal", bot });
    publicServer.listen(0);
    internalServer.listen(0);
  }

  it("returns 401 when bearer is wrong on internal listener", async () => {
    startServers();
    const res = await request(internalServer, {
      method: "GET",
      path: `/internal/guilds/${GUILD_ID}/roles`,
      headers: { Authorization: "Bearer not-the-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer is missing", async () => {
    startServers();
    const res = await request(internalServer, {
      method: "GET",
      path: `/internal/guilds/${GUILD_ID}/roles`,
    });
    expect(res.status).toBe(401);
  });

  it("lists guild roles with valid bearer", async () => {
    startServers();
    const res = await request(internalServer, {
      method: "GET",
      path: `/internal/guilds/${GUILD_ID}/roles`,
      headers: { Authorization: `Bearer ${internalToken}` },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      roles: [
        { id: "111", name: "Admin" },
        { id: "222", name: "Member" },
      ],
    });
    expect(bot.listGuildRoles).toHaveBeenCalledWith(GUILD_ID);
  });

  it("leaves guild with valid bearer", async () => {
    startServers();
    const res = await request(internalServer, {
      method: "POST",
      path: `/internal/guilds/${GUILD_ID}/leave`,
      headers: { Authorization: `Bearer ${internalToken}` },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(bot.leaveGuild).toHaveBeenCalledWith(GUILD_ID);
  });

  it("does not expose /internal on the public listener", async () => {
    startServers();
    const res = await request(publicServer, {
      method: "GET",
      path: `/internal/guilds/${GUILD_ID}/roles`,
      headers: { Authorization: `Bearer ${internalToken}` },
    });
    expect(res.status).toBe(404);
    expect(bot.listGuildRoles).not.toHaveBeenCalled();
  });
});
