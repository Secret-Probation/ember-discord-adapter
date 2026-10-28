/** Text and URL sanitization for Discord embeds (SPEC §13). */

const INVITE_PATTERNS = [/discord\.gg\//i, /discord\.com\/invite/i];

export function stripDiscordMentions(text: string): string {
  return text
    .replace(/@everyone/g, "@ everyone")
    .replace(/@here/g, "@ here")
    .replace(/<@[!&]?\d+>/g, "")
    .replace(/<#\d+>/g, "");
}

export function stripInviteLinks(text: string): string {
  let out = text;
  for (const pat of INVITE_PATTERNS) {
    out = out.replace(pat, "[invite removed]");
  }
  return out;
}

export function sanitizeFanText(text: string): string {
  return stripInviteLinks(stripDiscordMentions(text));
}

export function clipText(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 1)}…`;
}

const ALLOWED_WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be"]);

export function isAllowedWatchUrl(url: string, extraArchiveHost?: string | null): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      return false;
    }
    if (ALLOWED_WATCH_HOSTS.has(parsed.hostname)) {
      return true;
    }
    if (extraArchiveHost && parsed.hostname === extraArchiveHost) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Discord embed field value limit. */
export const EMBED_FIELD_MAX = 1024;
export const MESSAGE_CONTENT_MAX = 2000;
