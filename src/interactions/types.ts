/** Minimal Discord interaction payload (API v10). Snowflakes stay strings. */

export const INTERACTION_PING = 1;
export const INTERACTION_APPLICATION_COMMAND = 2;
export const INTERACTION_MESSAGE_COMPONENT = 3;
export const INTERACTION_AUTOCOMPLETE = 4;

export type InteractionPayload = {
  type: number;
  id?: string;
  token?: string;
  data?: {
    name?: string;
    options?: Array<{ name: string; type: number; value?: string }>;
  };
  member?: { roles?: string[]; user?: { id?: string } };
  user?: { id?: string };
  guild_id?: string;
  authorizing_integration_owners?: Record<string, unknown>;
};

export function guildIdFromInteraction(body: InteractionPayload): string | null {
  return body.guild_id?.trim() || null;
}

export function userIdFromInteraction(body: InteractionPayload): string | null {
  return body.member?.user?.id?.trim() || body.user?.id?.trim() || null;
}

export function memberRoleIds(body: InteractionPayload): string[] {
  const roles = body.member?.roles;
  if (!Array.isArray(roles)) {
    return [];
  }
  return roles.filter((r): r is string => typeof r === "string");
}

export function subcommandAndQuery(body: InteractionPayload): { sub: string | null; query: string } {
  const name = body.data?.name ?? null;
  if (name !== "ember") {
    return { sub: null, query: "" };
  }
  const options = body.data?.options ?? [];
  const subOpt = options.find((o) => o.name === "search" || o.name === "ask" || o.name === "about");
  if (!subOpt) {
    return { sub: null, query: "" };
  }
  if (subOpt.name === "about") {
    return { sub: "about", query: "" };
  }
  const nested = subOpt as { options?: Array<{ name: string; value?: string }> };
  const queryOpt = nested.options?.find((o) => o.name === "query");
  const query = typeof queryOpt?.value === "string" ? queryOpt.value : "";
  return { sub: subOpt.name, query };
}
