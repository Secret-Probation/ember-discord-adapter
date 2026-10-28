/** Map control-plane fan-query errors to fixed Discord ephemeral copy (SPEC §13). */

import type { FanQueryResult } from "./client.js";

export const CP_ERROR_COPY: Record<string, string> = {
  not_found:
    "This server isn't linked to a show yet. A show owner can connect Ember in Secret Probation.",
  discord_not_linked:
    "This server isn't linked to a show yet. A show owner can connect Ember in Secret Probation.",
  discord_ask_role_required: "You need the server's Ask role to use /ember ask.",
  ember_not_entitled: "This show doesn't have an active Ember subscription.",
  creator_credits_exhausted: "Ask credits for this show are exhausted. Search still works.",
  public_daily_ask_cap: "Daily Ask limit reached for this show. Search still works.",
  discord_interaction_replay: "That command was already handled.",
};

const STATUS_FALLBACK_COPY: Partial<Record<number, string>> = {
  402: CP_ERROR_COPY.creator_credits_exhausted,
  403: "Ember can't complete that request in this server.",
  404: CP_ERROR_COPY.discord_not_linked,
  429: CP_ERROR_COPY.public_daily_ask_cap,
};

export const FAN_QUERY_GENERIC_ERROR =
  "Something went wrong while reaching Ember. Try again in a moment.";

/** Resolve user-visible ephemeral text for a failed fan-query result. */
export function fanQueryErrorMessage(result: Extract<FanQueryResult, { ok: false }>): string {
  const byCode = CP_ERROR_COPY[result.code];
  if (byCode) {
    return byCode;
  }
  const byStatus = STATUS_FALLBACK_COPY[result.status];
  if (byStatus) {
    return byStatus;
  }
  return FAN_QUERY_GENERIC_ERROR;
}
