/** In-memory post-to-channel payload cache (SPEC §11, §12). */

import type { WebhookMessagePayload } from "../discord/webhook.js";
import { INTERACTION_TOKEN_TTL_MS } from "./ask-poll-loop.js";

export type ShareRollupInput = {
  jobId: string;
  playbackStartSeconds: number;
  speaker?: string | null;
};

export type PostCacheEntry = {
  invokerUserId: string;
  guildId: string;
  sourceInteractionId: string;
  publicPayload: WebhookMessagePayload;
  share: ShareRollupInput | null;
  expiresAtMs: number;
};

export class PostToChannelCache {
  private readonly entries = new Map<string, PostCacheEntry>();

  constructor(private readonly ttlMs: number = INTERACTION_TOKEN_TTL_MS) {}

  /** Store formatted public payload for a successful fan-query response. */
  set(
    sourceInteractionId: string,
    invokerUserId: string,
    guildId: string,
    publicPayload: WebhookMessagePayload,
    share: ShareRollupInput | null,
    nowMs: number = Date.now(),
  ): void {
    this.prune(nowMs);
    this.entries.set(sourceInteractionId, {
      invokerUserId,
      guildId,
      sourceInteractionId,
      publicPayload,
      share,
      expiresAtMs: nowMs + this.ttlMs,
    });
  }

  get(sourceInteractionId: string, nowMs: number = Date.now()): PostCacheEntry | null {
    this.prune(nowMs);
    const entry = this.entries.get(sourceInteractionId);
    if (!entry) {
      return null;
    }
    if (nowMs >= entry.expiresAtMs) {
      this.entries.delete(sourceInteractionId);
      return null;
    }
    return entry;
  }

  clearForTests(): void {
    this.entries.clear();
  }

  private prune(nowMs: number): void {
    for (const [key, entry] of this.entries) {
      if (nowMs >= entry.expiresAtMs) {
        this.entries.delete(key);
      }
    }
  }
}
