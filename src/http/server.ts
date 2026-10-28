import http from "node:http";

import type { AdapterConfig } from "../config.js";
import type { ControlPlaneClient } from "../cp/client.js";
import { verifyDiscordRequest } from "../discord/verify.js";
import { createInteractionHandler } from "../interactions/handler.js";
import { InteractionIdempotency } from "../interactions/idempotency.js";
import type { InteractionPayload } from "../interactions/types.js";
import { FixedWindowBucket, GuildRateLimiter, ProcessRpsLimiter } from "../rate-limit/buckets.js";

export type HttpServerDeps = {
  config: AdapterConfig;
  cp: ControlPlaneClient;
  deferOnly?: boolean;
};

export function createHttpServer(deps: HttpServerDeps): http.Server {
  const unsignedIpBucket = new FixedWindowBucket(deps.config.unsignedIpLimitPerMin, 60_000);
  const guildLimiter = new GuildRateLimiter(deps.config.guildLimitPerMin, deps.config.guildBurst);
  const processLimiter = new ProcessRpsLimiter(deps.config.processRps);
  const idempotency = new InteractionIdempotency(24 * 60 * 60 * 1000);

  const handleInteraction = createInteractionHandler({
    config: deps.config,
    cp: deps.cp,
    unsignedIpBucket,
    guildLimiter,
    processLimiter,
    idempotency,
    deferOnly: deps.deferOnly,
  });

  let accepting = true;

  const server = http.createServer(async (req, res) => {
    if (!accepting) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "shutting_down" }));
      return;
    }

    const url = req.url?.split("?")[0] ?? "";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "POST" && url === "/interactions") {
      await handleInteractionsPost(req, res, deps.config, unsignedIpBucket, handleInteraction);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.stopAccepting = () => {
    accepting = false;
  };

  return server;
}

async function readRawBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<{ ok: true; body: Buffer } | { ok: false; reason: "too_large" }> {
  const lenHeader = req.headers["content-length"];
  if (lenHeader) {
    const len = Number.parseInt(String(lenHeader), 10);
    if (Number.isFinite(len) && len > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
    chunks.push(buf);
  }
  return { ok: true, body: Buffer.concat(chunks) };
}

function clientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

async function handleInteractionsPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: AdapterConfig,
  unsignedIpBucket: FixedWindowBucket,
  handleInteraction: ReturnType<typeof createInteractionHandler>,
): Promise<void> {
  const signature = req.headers["x-signature-ed25519"]?.toString() ?? null;
  const timestamp = req.headers["x-signature-timestamp"]?.toString() ?? null;
  const ip = clientIp(req);

  if (!signature || !timestamp) {
    const cap = unsignedIpBucket.consume(ip);
    if (!cap.allowed) {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(cap.retryAfterSec) });
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const raw = await readRawBody(req, config.maxBodyBytes);
  if (!raw.ok) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "body_too_large" }));
    return;
  }

  const verified = await verifyDiscordRequest({
    rawBody: raw.body,
    signature,
    timestamp,
    publicKey: config.discordPublicKey,
    maxSkewSec: config.signatureMaxSkewSec,
  });

  if (!verified.ok) {
    if (verified.reason === "timestamp_skew") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const cap = unsignedIpBucket.consume(ip);
    if (!cap.allowed) {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(cap.retryAfterSec) });
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  let parsed: InteractionPayload;
  try {
    parsed = JSON.parse(raw.body.toString("utf8")) as InteractionPayload;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  const result = await handleInteraction({ rawBody: raw.body, clientIp: ip, parsed });
  res.writeHead(result.status, result.headers);
  res.end(result.body);
}

declare module "node:http" {
  interface Server {
    stopAccepting?: () => void;
  }
}
