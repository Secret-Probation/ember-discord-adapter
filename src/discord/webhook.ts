import { recordWebhookHttpStatus } from "../observability/metrics.js";

/** Interaction webhook client — PATCH @original (SPEC §11). Uses interaction token, not bot token. */

export type AllowedMentions = { parse: [] };

export type WebhookMessagePayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  allowed_mentions: AllowedMentions;
  /** Message flags (e.g. 64 = ephemeral) for interaction webhook edits. */
  flags?: number;
};

export type DiscordEmbed = {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
};

export type DiscordLinkButton = {
  type: 2;
  style: 5;
  label: string;
  url: string;
};

export type DiscordCustomButton = {
  type: 2;
  style: 1 | 2 | 3 | 4;
  label: string;
  custom_id: string;
};

export type DiscordMessageComponent = DiscordLinkButton | DiscordCustomButton;

export type DiscordActionRow = {
  type: 1;
  components: DiscordMessageComponent[];
};

export type EditInteractionMessageInput = {
  applicationId: string;
  token: string;
  payload: WebhookMessagePayload;
  fetchImpl?: typeof fetch;
};

const DISCORD_API = "https://discord.com/api/v10";

function webhookHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function withAllowedMentions(payload: WebhookMessagePayload): WebhookMessagePayload {
  return { ...payload, allowed_mentions: { parse: [] } };
}

/**
 * Edit the deferred ephemeral thinking message.
 * Retries PATCH twice, then POST fallback while the interaction token is valid (§11).
 */
export async function editOriginalInteractionMessage(input: EditInteractionMessageInput): Promise<boolean> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const body = JSON.stringify(withAllowedMentions(input.payload));
  const patchUrl = `${DISCORD_API}/webhooks/${input.applicationId}/${input.token}/messages/@original`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers: webhookHeaders(),
      body,
    });
    recordWebhookHttpStatus(res.status);
    if (res.ok) {
      return true;
    }
    if (res.status === 401) {
      return false;
    }
  }

  const postUrl = `${DISCORD_API}/webhooks/${input.applicationId}/${input.token}`;
  const postRes = await fetchImpl(postUrl, {
    method: "POST",
    headers: webhookHeaders(),
    body,
  });
  recordWebhookHttpStatus(postRes.status);
  return postRes.ok;
}

export type InteractionFollowUpResult = { ok: true } | { ok: false; status: number };

/** Channel-visible follow-up after component defer (type 6) — SPEC §11 post-to-channel. */
export async function createInteractionFollowUp(
  input: EditInteractionMessageInput,
): Promise<InteractionFollowUpResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const postUrl = `${DISCORD_API}/webhooks/${input.applicationId}/${input.token}`;
  const res = await fetchImpl(postUrl, {
    method: "POST",
    headers: webhookHeaders(),
    body: JSON.stringify(withAllowedMentions(input.payload)),
  });
  recordWebhookHttpStatus(res.status);
  if (res.ok) {
    return { ok: true };
  }
  return { ok: false, status: res.status };
}
