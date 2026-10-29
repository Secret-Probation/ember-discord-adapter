/** Async Ask poll loop after fan-query 202 (SPEC §7, §11). */

import type { ControlPlaneClient, FanQueryMode } from "../cp/client.js";
import type { AdapterConfig } from "../config.js";
import { FAN_QUERY_GENERIC_ERROR } from "../cp/error-map.js";
import { editOriginalInteractionMessage, type WebhookMessagePayload } from "../discord/webhook.js";
import { finalizeFanQueryEphemeralPayload, formatFanQueryResponse } from "../format/embed.js";
import { clipText, MESSAGE_CONTENT_MAX } from "../format/sanitize.js";
import type { PostToChannelCache } from "./post-cache.js";

export type AskPollLoopDeps = {
  config: AdapterConfig;
  cp: ControlPlaneClient;
  postCache: PostToChannelCache;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  sleepMs?: (ms: number) => Promise<void>;
};

export const ASK_POLL_INTERVAL_MS = 2_000;
export const ASK_STILL_WORKING_AT_MS = 90_000;
/** Discord interaction tokens expire after 15 minutes (§11). */
export const INTERACTION_TOKEN_TTL_MS = 15 * 60_000;
/** Stop polling and show an error before the token becomes invalid. */
export const ASK_HARD_STOP_BEFORE_TOKEN_MS = 30_000;

export const ASK_INITIAL_THINKING =
  "Ember is working on your answer…";
export const ASK_STILL_WORKING =
  "Ember is still working on your answer. Try again in a moment if this doesn't update.";

const allowedMentions = { parse: [] as [] };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultNow(): number {
  return Date.now();
}

/** Normalize CP poll JSON (flat answer) for `formatFanQueryResponse` (sync fan-query uses `{ ask }`). */
export function askPollBodyForFormatter(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return body;
  }
  const record = body as Record<string, unknown>;
  if (record.ask && typeof record.ask === "object") {
    return body;
  }
  if (typeof record.answer === "string") {
    return {
      ask: {
        answer: record.answer,
        citations: Array.isArray(record.citations) ? record.citations : [],
      },
    };
  }
  return body;
}

function textPayload(content: string): WebhookMessagePayload {
  return {
    content: clipText(content, MESSAGE_CONTENT_MAX),
    allowed_mentions: allowedMentions,
  };
}

export type RunAskPollLoopInput = {
  deps: AskPollLoopDeps;
  mode: FanQueryMode;
  guildId: string;
  interactionId: string;
  invokerUserId: string;
  applicationId: string;
  token: string;
  askJobId: string;
  startedAtMs?: number;
};

/**
 * Poll CP until Ask completes, fails, or we must hard-stop before token expiry.
 * Sends thinking, optional ~90s still-working, and final formatted edits via webhook.
 */
export async function runAskPollLoop(input: RunAskPollLoopInput): Promise<void> {
  const sleep = input.deps.sleepMs ?? defaultSleep;
  const now = input.deps.nowMs ?? defaultNow;
  const startedAtMs = input.startedAtMs ?? now();
  const hardStopAtMs = startedAtMs + INTERACTION_TOKEN_TTL_MS - ASK_HARD_STOP_BEFORE_TOKEN_MS;
  const maxPollElapsedMs = INTERACTION_TOKEN_TTL_MS - ASK_HARD_STOP_BEFORE_TOKEN_MS;
  let stillWorkingSent = false;

  const edit = async (payload: WebhookMessagePayload): Promise<void> => {
    const edited = await editOriginalInteractionMessage({
      applicationId: input.applicationId,
      token: input.token,
      payload,
      fetchImpl: input.deps.fetchImpl,
    });
    if (!edited.ok) {
      console.error("interaction_webhook_edit_failed", {
        interactionId: input.interactionId,
        mode: input.mode,
        phase: "ask_poll",
        httpStatus: edited.status,
        webhookPhase: edited.phase,
      });
    }
  };

  await edit(textPayload(ASK_INITIAL_THINKING));

  while (true) {
    const elapsed = now() - startedAtMs;
    if (now() >= hardStopAtMs || elapsed >= maxPollElapsedMs) {
      await edit(textPayload(FAN_QUERY_GENERIC_ERROR));
      return;
    }

    if (!stillWorkingSent && elapsed >= ASK_STILL_WORKING_AT_MS) {
      stillWorkingSent = true;
      await edit(textPayload(ASK_STILL_WORKING));
    }

    let pollResult;
    try {
      pollResult = await input.deps.cp.pollAskJob({
        askJobId: input.askJobId,
        guildId: input.guildId,
        interactionId: input.interactionId,
      });
    } catch (err) {
      console.error("ask_poll_request_failed", err);
      await edit(textPayload(FAN_QUERY_GENERIC_ERROR));
      return;
    }

    if (!pollResult.ok) {
      await edit(textPayload(FAN_QUERY_GENERIC_ERROR));
      return;
    }

    if (pollResult.status === "completed") {
      const formattedBody = askPollBodyForFormatter(pollResult.body);
      const formatted = formatFanQueryResponse(input.mode, formattedBody, {
        archiveWatchHost: input.deps.config.archiveWatchHost,
      });
      await edit(
        finalizeFanQueryEphemeralPayload({
          mode: input.mode,
          body: formattedBody,
          sourceInteractionId: input.interactionId,
          invokerUserId: input.invokerUserId,
          guildId: input.guildId,
          formatted,
          postCache: input.deps.postCache,
        }),
      );
      return;
    }

    if (pollResult.status === "failed") {
      await edit(textPayload(FAN_QUERY_GENERIC_ERROR));
      return;
    }

    const waitMs = Math.min(ASK_POLL_INTERVAL_MS, Math.max(0, hardStopAtMs - now()));
    if (waitMs <= 0) {
      await edit(textPayload(FAN_QUERY_GENERIC_ERROR));
      return;
    }
    await sleep(waitMs);
  }
}
