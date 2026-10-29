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
    custom_id?: string;
    component_type?: number;
    options?: Array<{ name: string; type: number; value?: string }>;
  };
  member?: { roles?: string[]; user?: { id?: string } };
  user?: { id?: string };
  guild_id?: string;
  authorizing_integration_owners?: Record<string, unknown>;
};

/** Application integration type 0 = guild install (Discord API v10). */
export const INTEGRATION_TYPE_GUILD = "0";

export function guildIdFromInteraction(body: InteractionPayload): string | null {
  return body.guild_id?.trim() || null;
}

/**
 * SPEC §5 — reject user-install-only contexts when authorizing_integration_owners is present.
 * When Discord omits the field (tests), guild_id alone is accepted.
 */
export function hasGuildInstallContext(body: InteractionPayload): boolean {
  const guildId = body.guild_id?.trim();
  if (!guildId) {
    return false;
  }
  const owners = body.authorizing_integration_owners;
  if (!owners || typeof owners !== "object") {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(owners, INTEGRATION_TYPE_GUILD)) {
    return false;
  }
  const guildOwner = owners[INTEGRATION_TYPE_GUILD];
  if (guildOwner == null) {
    return false;
  }
  const ownerId = typeof guildOwner === "string" ? guildOwner.trim() : String(guildOwner).trim();
  return ownerId.length > 0 && ownerId !== "0";
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
