import type { AdapterConfig } from "../config.js";
import type { ControlPlaneClient, FanQueryMode } from "../cp/client.js";
import { deferredEphemeralBody, pongResponseBody } from "../discord/verify.js";
import type { FixedWindowBucket, GuildRateLimiter, ProcessRpsLimiter } from "../rate-limit/buckets.js";
import { InteractionIdempotency } from "./idempotency.js";
import {
  INTERACTION_APPLICATION_COMMAND,
  INTERACTION_AUTOCOMPLETE,
  INTERACTION_PING,
  guildIdFromInteraction,
  memberRoleIds,
  subcommandAndQuery,
  userIdFromInteraction,
  type InteractionPayload,
} from "./types.js";

export const BUSY_MESSAGE = "Ember is busy — try again in a minute.";

export type InteractionHandlerDeps = {
  config: AdapterConfig;
  cp: ControlPlaneClient;
  unsignedIpBucket: FixedWindowBucket;
  guildLimiter: GuildRateLimiter;
  processLimiter: ProcessRpsLimiter;
  idempotency: InteractionIdempotency;
  /** When set, skip CP and webhook follow-up (unit tests). */
  deferOnly?: boolean;
};

export type HandleInteractionResult =
  | { status: number; headers: Record<string, string>; body: string; callCp: boolean };

export function createInteractionHandler(deps: InteractionHandlerDeps) {
  return async function handleInteraction(input: {
    rawBody: Buffer;
    clientIp: string;
    parsed: InteractionPayload;
  }): Promise<HandleInteractionResult> {
    const jsonHeaders = { "Content-Type": "application/json" };

    if (input.parsed.type === INTERACTION_PING) {
      return { status: 200, headers: jsonHeaders, body: pongResponseBody(), callCp: false };
    }

    if (input.parsed.type === INTERACTION_AUTOCOMPLETE) {
      return {
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ type: 8, data: [] }),
        callCp: false,
      };
    }

    if (input.parsed.type !== INTERACTION_APPLICATION_COMMAND) {
      return { status: 400, headers: jsonHeaders, body: JSON.stringify({ error: "unsupported_type" }), callCp: false };
    }

    const guildId = guildIdFromInteraction(input.parsed);
    if (!guildId) {
      return {
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 4,
          data: { content: "Ember only works in servers.", flags: 64 },
        }),
        callCp: false,
      };
    }

    const processCap = deps.processLimiter.consume();
    if (!processCap.allowed) {
      return ephemeralMessage(BUSY_MESSAGE);
    }

    const guildCap = deps.guildLimiter.consume(guildId);
    if (!guildCap.allowed) {
      return ephemeralMessage(BUSY_MESSAGE);
    }

    const interactionId = input.parsed.id;
    if (!interactionId) {
      return { status: 400, headers: jsonHeaders, body: JSON.stringify({ error: "missing_id" }), callCp: false };
    }

    if (!deps.idempotency.claim(interactionId)) {
      return ephemeralMessage("Already handling this command.");
    }

    if (deps.deferOnly) {
      return { status: 200, headers: jsonHeaders, body: deferredEphemeralBody(), callCp: false };
    }

    void runDeferredCommand(deps, input.parsed, guildId).catch((err) => {
      console.error("deferred_command_failed", err);
    });

    return { status: 200, headers: jsonHeaders, body: deferredEphemeralBody(), callCp: true };
  };
}

function ephemeralMessage(content: string): HandleInteractionResult {
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 4, data: { content, flags: 64 } }),
    callCp: false,
  };
}

async function runDeferredCommand(
  deps: InteractionHandlerDeps,
  body: InteractionPayload,
  guildId: string,
): Promise<void> {
  const { sub, query } = subcommandAndQuery(body);
  if (!sub) {
    return;
  }
  const mode = sub as FanQueryMode;
  const userId = userIdFromInteraction(body) ?? "unknown";
  await deps.cp.fanQuery({
    guildId,
    discordUserId: userId,
    interactionId: body.id ?? "",
    mode,
    query,
    memberRoleIds: memberRoleIds(body),
  });
  // Webhook PATCH to edit thinking message — §22.5
}
