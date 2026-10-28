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

const EMBED_DESCRIPTION_MAX = 4096;
const EMBED_TITLE_MAX = 256;
const EMBED_COMBINED_MAX = 6000;
const MAX_SEARCH_MOMENTS = 5;
const MAX_ASK_CITATIONS = 3;
const FOOTER_TEXT = "Ember · released episodes only";
const GENERIC_MODE_MESSAGE = "Ember finished, but there is nothing to show.";

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

  const description = clipText(`${askLine}${archiveLine}`, EMBED_DESCRIPTION_MAX);
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
