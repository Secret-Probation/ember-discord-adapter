import http from "node:http";

import { describe, expect, it, afterEach, vi } from "vitest";

import { createConfig } from "../src/config.js";
import { StubControlPlaneClient } from "../src/cp/client.js";
import { createHttpServer } from "../src/http/server.js";
import { signDiscordBody, TEST_PUBLIC_KEY } from "./helpers/discord-sign.js";

function postInteraction(
  server: http.Server,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
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
        method: "POST",
        path: "/interactions",
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("POST /interactions", () => {
  const config = createConfig({
    discordPublicKey: TEST_PUBLIC_KEY,
    discordApplicationId: "417719114458901252",
    unsignedIpLimitPerMin: 1000,
    guildLimitPerMin: 1000,
    guildBurst: 1000,
    processRps: 1000,
  });

  let server: http.Server;
  let stub: StubControlPlaneClient;

  afterEach(() => {
    server?.close();
  });

  const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));

  function startServer(deferOnly = false): void {
    stub = new StubControlPlaneClient();
    mockFetch.mockClear();
    server = createHttpServer({ config, cp: stub, deferOnly, fetchImpl: mockFetch });
    server.listen(0);
  }

  it("PING returns type 1 with application/json", async () => {
    startServer(true);
    const body = JSON.stringify({ type: 1 });
    const ts = String(Math.floor(Date.now() / 1000));
    const { signature } = signDiscordBody(body, ts);
    const res = await postInteraction(server, body, {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": ts,
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({ type: 1 });
    expect(stub.calls).toHaveLength(0);
  });

  it("rejects re-serialized body with different signature", async () => {
    startServer(true);
    const body = JSON.stringify({ type: 1, extra: true });
    const ts = String(Math.floor(Date.now() / 1000));
    const canonical = JSON.stringify({ type: 1 });
    const { signature } = signDiscordBody(canonical, ts);
    const res = await postInteraction(server, body, {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": ts,
    });
    expect(res.status).toBe(401);
  });

  it("defers slash command with type 5 flag 64", async () => {
    startServer(true);
    const payload = {
      type: 2,
      id: "1234567890123456789",
      token: "token",
      guild_id: "9876543210987654321",
      data: {
        name: "ember",
        options: [{ name: "search", type: 1, options: [{ name: "query", type: 3, value: "hello" }] }],
      },
      member: { roles: [], user: { id: "111" } },
    };
    const body = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const { signature } = signDiscordBody(body, ts);
    const res = await postInteraction(server, body, {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": ts,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body) as { type: number; data?: { flags?: number } };
    expect(json.type).toBe(5);
    expect(json.data?.flags).toBe(64);
  });

  it("does not call fan-query twice for the same interaction id", async () => {
    startServer(false);
    const payload = {
      type: 2,
      id: "9999999999999999999",
      token: "token",
      guild_id: "9876543210987654321",
      data: {
        name: "ember",
        options: [
          { name: "ask", type: 1, options: [{ name: "query", type: 3, value: "q" }] },
        ],
      },
      member: { roles: [], user: { id: "111" } },
    };
    const body = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const { signature } = signDiscordBody(body, ts);
    const headers = {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": ts,
    };
    await postInteraction(server, body, headers);
    await postInteraction(server, body, headers);
    await new Promise((r) => setTimeout(r, 50));
    expect(stub.calls.length).toBeLessThanOrEqual(1);
  });

  it("returns 429 for unsigned IP over cap", async () => {
    const tight = createConfig({
      discordPublicKey: TEST_PUBLIC_KEY,
      unsignedIpLimitPerMin: 1,
      guildLimitPerMin: 1000,
      guildBurst: 1000,
      processRps: 1000,
    });
    stub = new StubControlPlaneClient();
    server = createHttpServer({ config: tight, cp: stub, deferOnly: true });
    server.listen(0);
    const r1 = await postInteraction(server, "{}", {});
    const r2 = await postInteraction(server, "{}", {});
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(429);
  });
});
