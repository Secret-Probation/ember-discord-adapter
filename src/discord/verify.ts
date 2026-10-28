import { verifyKey } from "discord-interactions";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "body_too_large" | "timestamp_skew" | "bad_signature" };

export async function verifyDiscordRequest(input: {
  rawBody: Buffer;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
  maxSkewSec: number;
  nowSec?: number;
}): Promise<VerifyResult> {
  const { rawBody, signature, timestamp, publicKey, maxSkewSec } = input;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);

  if (!signature || !timestamp) {
    return { ok: false, reason: "missing_headers" };
  }

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > maxSkewSec) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const valid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!valid) {
    return { ok: false, reason: "bad_signature" };
  }

  return { ok: true };
}

/** PING response (SPEC §11). */
export function pongResponseBody(): string {
  return JSON.stringify({ type: 1 });
}

/** Deferred ephemeral ack (SPEC §11). */
export function deferredEphemeralBody(): string {
  return JSON.stringify({ type: 5, data: { flags: 64 } });
}
