import type { AdapterConfig } from "../config.js";
import type { ControlPlaneClient, FanQueryMode } from "../cp/client.js";
import { FAN_QUERY_GENERIC_ERROR, fanQueryErrorMessage } from "../cp/error-map.js";
import {
  createInteractionFollowUp,
  editOriginalInteractionMessage,
  type WebhookMessagePayload,
} from "../discord/webhook.js";
import { deferredEphemeralBody, pongResponseBody } from "../discord/verify.js";
import {
  finalizeFanQueryEphemeralPayload,
  formatFanQueryResponse,
  parsePostCustomId,
} from "../format/embed.js";
import { clipText, MESSAGE_CONTENT_MAX } from "../format/sanitize.js";
import {
  commandsTotal,
  deferLatencySeconds,
  fanQueryLatencySeconds,
  recordPostToChannel,
} from "../observability/metrics.js";
import type { FixedWindowBucket, GuildRateLimiter, ProcessRpsLimiter } from "../rate-limit/buckets.js";
import { runAskPollLoop } from "./ask-poll-loop.js";
import { InteractionIdempotency } from "./idempotency.js";
import { PostToChannelCache } from "./post-cache.js";
import {
  INTERACTION_APPLICATION_COMMAND,
  INTERACTION_AUTOCOMPLETE,
  INTERACTION_MESSAGE_COMPONENT,
  INTERACTION_PING,
  guildIdFromInteraction,
  hasGuildInstallContext,
  memberRoleIds,
  subcommandAndQuery,
  userIdFromInteraction,
  type InteractionPayload,
} from "./types.js";

export const BUSY_MESSAGE = "Ember is busy — try again in a minute.";
export const POST_CACHE_MISS_MESSAGE = "Run the command again.";
export const POST_CHANNEL_FORBIDDEN_MESSAGE = "Ember can't post in this channel.";

export type InteractionHandlerDeps = {
  config: AdapterConfig;
  cp: ControlPlaneClient;
  unsignedIpBucket: FixedWindowBucket;
  guildLimiter: GuildRateLimiter;
  processLimiter: ProcessRpsLimiter;
  idempotency: InteractionIdempotency;
  postCache: PostToChannelCache;
  /** When set, skip CP and webhook follow-up (unit tests). */
  deferOnly?: boolean;
  /** Injectable fetch for webhook edits (tests). */
  fetchImpl?: typeof fetch;
  /** Injectable clock / sleep for Ask poll loop (tests). */
  nowMs?: () => number;
  sleepMs?: (ms: number) => Promise<void>;
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

    if (input.parsed.type === INTERACTION_MESSAGE_COMPONENT) {
      return handleMessageComponent(deps, input.parsed);
    }

    if (input.parsed.type !== INTERACTION_APPLICATION_COMMAND) {
      return { status: 400, headers: jsonHeaders, body: JSON.stringify({ error: "unsupported_type" }), callCp: false };
    }

    const handlerStarted = Date.now();

    if (!hasGuildInstallContext(input.parsed)) {
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

    const guildId = guildIdFromInteraction(input.parsed);
    if (!guildId) {
      return ephemeralMessage("Ember only works in servers.");
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

    const { sub } = subcommandAndQuery(input.parsed);
    if (sub === "search" || sub === "ask" || sub === "about") {
      commandsTotal.inc({ mode: sub });
    }

    deferLatencySeconds.observe({}, (Date.now() - handlerStarted) / 1000);

    if (deps.deferOnly) {
      return { status: 200, headers: jsonHeaders, body: deferredEphemeralBody(), callCp: false };
    }

    void runDeferredCommand(deps, input.parsed, guildId);

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

function deferredComponentAck(): HandleInteractionResult {
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 6, data: {} }),
    callCp: false,
  };
}

function ignoredComponentUpdate(): HandleInteractionResult {
  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 6, data: { flags: 64 } }),
    callCp: false,
  };
}

function handleMessageComponent(
  deps: InteractionHandlerDeps,
  body: InteractionPayload,
): HandleInteractionResult {
  if (!hasGuildInstallContext(body)) {
    return ephemeralMessage("Ember only works in servers.");
  }

  const guildId = guildIdFromInteraction(body);
  if (!guildId) {
    return ephemeralMessage("Ember only works in servers.");
  }

  const processCap = deps.processLimiter.consume();
  if (!processCap.allowed) {
    return ephemeralMessage(BUSY_MESSAGE);
  }

  const guildCap = deps.guildLimiter.consume(guildId);
  if (!guildCap.allowed) {
    return ephemeralMessage(BUSY_MESSAGE);
  }

  const customId = body.data?.custom_id?.trim() ?? "";
  const sourceInteractionId = parsePostCustomId(customId);
  if (!sourceInteractionId) {
    return ignoredComponentUpdate();
  }

  const invokerUserId = userIdFromInteraction(body);
  if (!invokerUserId) {
    return ignoredComponentUpdate();
  }

  const cached = deps.postCache.get(sourceInteractionId);
  if (!cached) {
    return ephemeralMessage(POST_CACHE_MISS_MESSAGE);
  }

  if (cached.invokerUserId !== invokerUserId) {
    return ignoredComponentUpdate();
  }

  void runPostToChannelFromComponent(deps, body, cached);
  return deferredComponentAck();
}

async function runPostToChannelFromComponent(
  deps: InteractionHandlerDeps,
  body: InteractionPayload,
  cached: {
    guildId: string;
    invokerUserId: string;
    publicPayload: WebhookMessagePayload;
    sourceInteractionId: string;
    share: { jobId: string; playbackStartSeconds: number; speaker?: string | null } | null;
  },
): Promise<void> {
  const applicationId = deps.config.discordApplicationId.trim();
  const token = body.token?.trim();
  if (!token || !applicationId) {
    return;
  }

  const followUp = await createInteractionFollowUp({
    applicationId,
    token,
    payload: {
      ...cached.publicPayload,
      allowed_mentions: { parse: [] },
    },
    fetchImpl: deps.fetchImpl,
  });

  if (followUp.ok) {
    recordPostToChannel();
    await recordShareRollup(deps, cached);
    return;
  }

  if (followUp.status === 403) {
    await editOriginalInteractionMessage({
      applicationId,
      token,
      payload: {
        content: clipText(POST_CHANNEL_FORBIDDEN_MESSAGE, MESSAGE_CONTENT_MAX),
        allowed_mentions: { parse: [] },
        flags: 64,
      },
      fetchImpl: deps.fetchImpl,
    });
    return;
  }

  console.error("post_to_channel_followup_failed", {
    interactionId: body.id,
    status: followUp.status,
  });
}

async function recordShareRollup(
  deps: InteractionHandlerDeps,
  cached: {
    guildId: string;
    sourceInteractionId: string;
    share: { jobId: string; playbackStartSeconds: number; speaker?: string | null } | null;
  },
): Promise<void> {
  if (!cached.share) {
    return;
  }
  try {
    const result = await deps.cp.recordDiscordShare({
      guildId: cached.guildId,
      interactionId: cached.sourceInteractionId,
      jobId: cached.share.jobId,
      playbackStartSeconds: cached.share.playbackStartSeconds,
      speaker: cached.share.speaker,
    });
    if (!result.ok) {
      console.error("discord_share_rollup_failed", {
        interactionId: cached.sourceInteractionId,
        status: result.status,
      });
    }
  } catch (err) {
    console.error("discord_share_rollup_failed", err);
  }
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
  const token = body.token?.trim();
  const applicationId = deps.config.discordApplicationId.trim();
  if (!token || !applicationId) {
    return;
  }

  // Do not use discord.js deferReply()+followUp() here: followUp can edit the
  // original ephemeral instead of posting a new message (SPEC §11).

  let payload: WebhookMessagePayload;
  try {
    const fanQueryStarted = Date.now();
    const result = await deps.cp.fanQuery({
      guildId,
      discordUserId: userId,
      interactionId: body.id ?? "",
      mode,
      query,
      memberRoleIds: memberRoleIds(body),
    });
    fanQueryLatencySeconds.observe({ mode }, (Date.now() - fanQueryStarted) / 1000);

    if (!result.ok) {
      payload = {
        content: clipText(fanQueryErrorMessage(result), MESSAGE_CONTENT_MAX),
        allowed_mentions: { parse: [] },
      };
    } else if (result.status === 202) {
      await runAskPollLoop({
        deps: {
          config: deps.config,
          cp: deps.cp,
          postCache: deps.postCache,
          fetchImpl: deps.fetchImpl,
          nowMs: deps.nowMs,
          sleepMs: deps.sleepMs,
        },
        mode,
        guildId,
        interactionId: body.id ?? "",
        invokerUserId: userId,
        applicationId,
        token,
        askJobId: result.askJobId,
      });
      return;
    } else {
      const formatted = formatFanQueryResponse(mode, result.body, {
        archiveWatchHost: deps.config.archiveWatchHost,
      });
      payload = finalizeFanQueryEphemeralPayload({
        mode,
        body: result.body,
        sourceInteractionId: body.id ?? "",
        invokerUserId: userId,
        guildId,
        formatted,
        postCache: deps.postCache,
      });
    }
  } catch (err) {
    console.error("deferred_command_failed", err);
    payload = {
      content: clipText(FAN_QUERY_GENERIC_ERROR, MESSAGE_CONTENT_MAX),
      allowed_mentions: { parse: [] },
    };
  }

  const edited = await editOriginalInteractionMessage({
    applicationId,
    token,
    payload,
    fetchImpl: deps.fetchImpl,
  });
  if (!edited.ok) {
    console.error("interaction_webhook_edit_failed", {
      interactionId: body.id,
      mode,
      httpStatus: edited.status,
      phase: edited.phase,
    });
  }
}
