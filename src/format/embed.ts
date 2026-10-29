/** Discord embed formatter for fan-query results (SPEC §13). */

import {
  clipText,
  EMBED_FIELD_MAX,
  isAllowedWatchUrl,
  MESSAGE_CONTENT_MAX,
  sanitizeFanText,
} from "./sanitize.js";
import type { FanQueryMode } from "../cp/client.js";
import type { DiscordActionRow, DiscordEmbed, WebhookMessagePayload } from "../discord/webhook.js";
import type { PostToChannelCache } from "../interactions/post-cache.js";

const EMBED_DESCRIPTION_MAX = 4096;
const EMBED_TITLE_MAX = 256;
const EMBED_COMBINED_MAX = 6000;
const MAX_SEARCH_MOMENTS = 5;
const MAX_ASK_CITATIONS = 3;
const FOOTER_TEXT = "Ember · released episodes only";
const GENERIC_MODE_MESSAGE = "Ember finished, but there is nothing to show.";
export const POST_TO_CHANNEL_BUTTON_LABEL = "Post to channel";
export const POST_CUSTOM_ID_PREFIX = "post:";

export type ShareRollupFields = {
  jobId: string;
  playbackStartSeconds: number;
  speaker?: string | null;
};

export type FormatEmbedOptions = {
  archiveWatchHost?: string | null;
};

type MomentLike = {
  episode_title?: string | null;
  speaker?: string | null;
  playback_start_seconds?: number | null;
  start_seconds?: number | null;
  snippet?: string | null;
  watch_url?: string | null;
  job_id?: string | null;
};

type AboutLike = {
  show_name?: string | null;
  ask_available?: boolean | null;
  archive_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  deletion_url?: string | null;
  report_url?: string | null;
  operator_name?: string | null;
  age_restricted?: boolean | null;
  data_retention_hours?: number | null;
};

function embedTextLength(embed: DiscordEmbed): number {
  let total = 0;
  if (embed.title) {
    total += embed.title.length;
  }
  if (embed.description) {
    total += embed.description.length;
  }
  if (embed.footer?.text) {
    total += embed.footer.text.length;
  }
  for (const field of embed.fields ?? []) {
    total += field.name.length + field.value.length;
  }
  return total;
}

function totalEmbedText(embeds: DiscordEmbed[]): number {
  return embeds.reduce((sum, e) => sum + embedTextLength(e), 0);
}

function baseFooter(): { text: string } {
  return { text: FOOTER_TEXT };
}

function formatPlaybackTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return "—";
  }
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readMoments(body: unknown): MomentLike[] {
  if (!body || typeof body !== "object") {
    return [];
  }
  const record = body as Record<string, unknown>;
  const search = record.search;
  if (!search || typeof search !== "object") {
    return [];
  }
  const hits = (search as Record<string, unknown>).hits;
  if (!Array.isArray(hits)) {
    return [];
  }
  return hits.filter((h): h is MomentLike => h != null && typeof h === "object").slice(0, MAX_SEARCH_MOMENTS);
}

function readAsk(body: unknown): { answer: string; citations: MomentLike[] } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const ask = (body as Record<string, unknown>).ask;
  if (!ask || typeof ask !== "object") {
    return null;
  }
  const record = ask as Record<string, unknown>;
  const answer = typeof record.answer === "string" ? record.answer : "";
  const rawCitations = record.citations;
  const citations: MomentLike[] = Array.isArray(rawCitations)
    ? rawCitations
        .filter((c): c is MomentLike => c != null && typeof c === "object")
        .slice(0, MAX_ASK_CITATIONS)
    : [];
  return { answer, citations };
}

function readAbout(body: unknown): AboutLike | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const nested = record.about;
  if (nested && typeof nested === "object") {
    return nested as AboutLike;
  }
  if (typeof record.show_name === "string" || record.ask_available != null || record.archive_url != null) {
    return {
      show_name: typeof record.show_name === "string" ? record.show_name : null,
      ask_available: typeof record.ask_available === "boolean" ? record.ask_available : null,
      archive_url: typeof record.archive_url === "string" ? record.archive_url : null,
    };
  }
  return null;
}

function momentFieldLabel(index: number, moment: MomentLike): string {
  const title = moment.episode_title?.trim();
  if (title) {
    return clipText(sanitizeFanText(title), 256);
  }
  return `Moment ${index + 1}`;
}

function momentFieldValue(moment: MomentLike): string {
  const speaker = moment.speaker?.trim() ? sanitizeFanText(moment.speaker.trim()) : "Unknown speaker";
  const playback =
    moment.playback_start_seconds ?? moment.start_seconds ?? null;
  const ts = formatPlaybackTimestamp(playback);
  const snippetRaw = moment.snippet?.trim() ? moment.snippet.trim() : "—";
  const snippet = clipText(sanitizeFanText(snippetRaw), EMBED_FIELD_MAX - speaker.length - ts.length - 8);
  return clipText(`${speaker} · ${ts}\n${snippet}`, EMBED_FIELD_MAX);
}

function watchButtonRow(label: string, url: string): DiscordActionRow {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: clipText(label, 80),
        url,
      },
    ],
  };
}

function buildSearchPayload(body: unknown, opts: FormatEmbedOptions): WebhookMessagePayload {
  const moments = readMoments(body);
  if (moments.length === 0) {
    return {
      content: clipText("No matching moments in released episodes.", MESSAGE_CONTENT_MAX),
      allowed_mentions: { parse: [] },
    };
  }

  const fields = moments.map((moment, idx) => ({
    name: momentFieldLabel(idx, moment),
    value: momentFieldValue(moment),
    inline: false,
  }));

  const embed: DiscordEmbed = {
    title: "Search results",
    fields,
    footer: baseFooter(),
  };

  const components: DiscordActionRow[] = [];
  moments.forEach((moment, idx) => {
    const url = moment.watch_url;
    if (typeof url === "string" && isAllowedWatchUrl(url, opts.archiveWatchHost)) {
      components.push(watchButtonRow(`Watch ${idx + 1}`, url));
    }
  });

  return trimToCaps({
    embeds: [embed],
    components: components.length > 0 ? components : undefined,
    allowed_mentions: { parse: [] },
  });
}

function buildAskPayload(body: unknown, opts: FormatEmbedOptions): WebhookMessagePayload {
  const ask = readAsk(body);
  if (!ask) {
    return {
      content: clipText("No answer available.", MESSAGE_CONTENT_MAX),
      allowed_mentions: { parse: [] },
    };
  }

  const answer = clipText(sanitizeFanText(ask.answer), EMBED_DESCRIPTION_MAX);
  const fields = ask.citations.map((citation, idx) => ({
    name: `Citation ${idx + 1}`,
    value: momentFieldValue(citation),
    inline: false,
  }));

  const embed: DiscordEmbed = {
    title: "Answer",
    description: answer,
    fields: fields.length > 0 ? fields : undefined,
    footer: baseFooter(),
  };

  const components: DiscordActionRow[] = [];
  ask.citations.forEach((citation, idx) => {
    const url = citation.watch_url;
    if (typeof url === "string" && isAllowedWatchUrl(url, opts.archiveWatchHost)) {
      components.push(watchButtonRow(`Watch ${idx + 1}`, url));
    }
  });

  return trimToCaps({
    embeds: [embed],
    components: components.length > 0 ? components : undefined,
    allowed_mentions: { parse: [] },
  });
}

function buildAboutPayload(body: unknown): WebhookMessagePayload {
  const about = readAbout(body);
  const showName = about?.show_name?.trim()
    ? sanitizeFanText(about.show_name.trim())
    : "This show";
  const askLine =
    about?.ask_available === false
      ? "Ask is not available for this show right now."
      : "Ask is available for released episodes.";
  const archiveUrl = about?.archive_url?.trim();
  const archiveLine =
    archiveUrl && archiveUrl.startsWith("https://")
      ? `\nPublic archive: ${sanitizeFanText(archiveUrl)}`
      : "";

  const operator = about?.operator_name?.trim() ? sanitizeFanText(about.operator_name.trim()) : "Secret Probation";
  const retentionHours =
    typeof about?.data_retention_hours === "number" && about.data_retention_hours > 0
      ? about.data_retention_hours
      : 72;
  const legalLines: string[] = [];
  const pushLink = (label: string, url: string | null | undefined) => {
    const trimmed = url?.trim();
    if (trimmed && trimmed.startsWith("https://")) {
      legalLines.push(`${label}: ${sanitizeFanText(trimmed)}`);
    }
  };
  pushLink("Privacy", about?.privacy_url);
  pushLink("Terms", about?.terms_url);
  pushLink("Delete my data", about?.deletion_url);
  pushLink("Report", about?.report_url);
  const ageLine = about?.age_restricted === false ? "" : "\n18+ — podcast archive search.";
  const legalBlock =
    legalLines.length > 0
      ? `\n\n${operator} · question text deleted after ${retentionHours}h.\n${legalLines.join("\n")}${ageLine}`
      : `\n\n${operator} · question text deleted after ${retentionHours}h.${ageLine}`;

  const description = clipText(`${askLine}${archiveLine}${legalBlock}`, EMBED_DESCRIPTION_MAX);
  const embed: DiscordEmbed = {
    title: clipText(showName, EMBED_TITLE_MAX),
    description,
    footer: baseFooter(),
  };

  return trimToCaps({
    embeds: [embed],
    allowed_mentions: { parse: [] },
  });
}

function trimToCaps(payload: WebhookMessagePayload): WebhookMessagePayload {
  const embeds = payload.embeds ?? [];
  if (embeds.length === 0) {
    return payload;
  }

  let working = embeds.map((e) => ({ ...e, fields: e.fields ? [...e.fields] : undefined }));
  let components = payload.components ? [...payload.components] : undefined;
  while (working.length > 0 && totalEmbedText(working) > EMBED_COMBINED_MAX) {
    const last = working[working.length - 1];
    if (last?.fields && last.fields.length > 0) {
      last.fields.pop();
      if (components && components.length > 0) {
        components.pop();
      }
      continue;
    }
    working.pop();
  }

  if (working.length === 0) {
    return {
      content: clipText("Results are too long to display here.", MESSAGE_CONTENT_MAX),
      allowed_mentions: { parse: [] },
    };
  }

  return {
    ...payload,
    embeds: working,
    components: components && components.length > 0 ? components : undefined,
  };
}

export function postCustomId(sourceInteractionId: string): string {
  return `${POST_CUSTOM_ID_PREFIX}${sourceInteractionId}`;
}

export function parsePostCustomId(customId: string): string | null {
  const trimmed = customId.trim();
  if (!trimmed.startsWith(POST_CUSTOM_ID_PREFIX)) {
    return null;
  }
  const id = trimmed.slice(POST_CUSTOM_ID_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

function postButtonRow(sourceInteractionId: string): DiscordActionRow {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: clipText(POST_TO_CHANNEL_BUTTON_LABEL, 80),
        custom_id: clipText(postCustomId(sourceInteractionId), 100),
      },
    ],
  };
}

function isPostButtonComponent(component: DiscordActionRow["components"][number]): boolean {
  return (
    component.type === 2 &&
    component.style !== 5 &&
    "custom_id" in component &&
    typeof component.custom_id === "string" &&
    component.custom_id.startsWith(POST_CUSTOM_ID_PREFIX)
  );
}

/** Remove post-to-channel button rows — public channel posts must not include the button. */
export function publicChannelPayload(payload: WebhookMessagePayload): WebhookMessagePayload {
  const components = payload.components?.filter((row) => !row.components.some(isPostButtonComponent));
  return {
    ...payload,
    components: components && components.length > 0 ? components : undefined,
    allowed_mentions: { parse: [] },
  };
}

/** Attach post button to ephemeral fan-query replies when allowed. */
export function withPostToChannelButton(
  payload: WebhookMessagePayload,
  sourceInteractionId: string,
): WebhookMessagePayload {
  const base = publicChannelPayload(payload);
  return {
    ...base,
    components: [...(base.components ?? []), postButtonRow(sourceInteractionId)],
    allowed_mentions: { parse: [] },
  };
}

function firstShareFields(moments: MomentLike[]): ShareRollupFields | null {
  for (const moment of moments) {
    const jobId = moment.job_id?.trim();
    if (!jobId) {
      continue;
    }
    const playbackRaw = moment.playback_start_seconds ?? moment.start_seconds ?? null;
    const playbackStartSeconds =
      playbackRaw != null && Number.isFinite(playbackRaw) ? Math.max(0, Math.floor(playbackRaw)) : 0;
    return {
      jobId,
      playbackStartSeconds,
      speaker: moment.speaker?.trim() ? moment.speaker.trim() : null,
    };
  }
  return null;
}

/** First rendered moment with a job id — used for §14 share rollup after public post. */
export function extractShareRollupFields(mode: FanQueryMode, body: unknown): ShareRollupFields | null {
  switch (mode) {
    case "search":
      return firstShareFields(readMoments(body));
    case "ask": {
      const ask = readAsk(body);
      return ask ? firstShareFields(ask.citations) : null;
    }
    default:
      return null;
  }
}

/** Whether the post button may appear on a successful fan-query reply. */
export function shouldOfferPostToChannel(mode: FanQueryMode, body: unknown): boolean {
  if (mode === "about") {
    return false;
  }
  if (mode === "search") {
    return readMoments(body).length > 0;
  }
  if (mode === "ask") {
    const ask = readAsk(body);
    return ask != null && ask.answer.trim().length > 0;
  }
  return false;
}

/** Cache public payload and attach post button for ephemeral fan-query replies. */
export function finalizeFanQueryEphemeralPayload(input: {
  mode: FanQueryMode;
  body: unknown;
  sourceInteractionId: string;
  invokerUserId: string;
  guildId: string;
  formatted: WebhookMessagePayload;
  postCache: PostToChannelCache;
}): WebhookMessagePayload {
  if (!shouldOfferPostToChannel(input.mode, input.body)) {
    return input.formatted;
  }
  const shareFields = extractShareRollupFields(input.mode, input.body);
  const publicPayload = publicChannelPayload(input.formatted);
  input.postCache.set(
    input.sourceInteractionId,
    input.invokerUserId,
    input.guildId,
    publicPayload,
    shareFields
      ? {
          jobId: shareFields.jobId,
          playbackStartSeconds: shareFields.playbackStartSeconds,
          speaker: shareFields.speaker,
        }
      : null,
  );
  return withPostToChannelButton(input.formatted, input.sourceInteractionId);
}

/** Build webhook payload for a successful sync fan-query body. */
export function formatFanQueryResponse(
  mode: FanQueryMode,
  body: unknown,
  opts: FormatEmbedOptions = {},
): WebhookMessagePayload {
  switch (mode) {
    case "search":
      return buildSearchPayload(body, opts);
    case "ask":
      return buildAskPayload(body, opts);
    case "about":
      return buildAboutPayload(body);
    default:
      return {
        content: clipText(GENERIC_MODE_MESSAGE, MESSAGE_CONTENT_MAX),
        allowed_mentions: { parse: [] },
      };
  }
}

/** Exposed for tests — combined character count across embeds. */
export function combinedEmbedCharCount(embeds: DiscordEmbed[]): number {
  return totalEmbedText(embeds);
}
