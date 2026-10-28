/** Environment configuration (SPEC §11–§12, §18). */

export type AdapterConfig = {
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  discordPublicKey: string;
  discordApplicationId: string;
  maxBodyBytes: number;
  signatureMaxSkewSec: number;
  unsignedIpLimitPerMin: number;
  guildLimitPerMin: number;
  guildBurst: number;
  processRps: number;
  oauthIpLimitPerMin: number;
  shutdownGraceMs: number;
  cpBaseUrl: string;
  cpServiceBearer: string;
  adapterInternalToken: string;
  /** Optional https host for archive watch links (SPEC §13). */
  archiveWatchHost: string | null;
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/** Load config for production; tests pass partial overrides via createConfig. */
export function loadConfig(): AdapterConfig {
  return createConfig({});
}

export function createConfig(overrides: Partial<AdapterConfig>): AdapterConfig {
  const base: AdapterConfig = {
    port: parseIntEnv("PORT", 8787),
    logLevel: (process.env.LOG_LEVEL?.trim().toLowerCase() as AdapterConfig["logLevel"]) || "info",
    discordPublicKey: process.env.DISCORD_PUBLIC_KEY?.trim() ?? "",
    discordApplicationId: process.env.DISCORD_APPLICATION_ID?.trim() ?? "",
    maxBodyBytes: 256 * 1024,
    signatureMaxSkewSec: 5 * 60,
    unsignedIpLimitPerMin: parseIntEnv("DISCORD_UNSIGNED_IP_LIMIT_PER_MIN", 60),
    guildLimitPerMin: parseIntEnv("DISCORD_GUILD_LIMIT_PER_MIN", 30),
    guildBurst: parseIntEnv("DISCORD_GUILD_BURST", 10),
    processRps: parseIntEnv("DISCORD_PROCESS_RPS", 50),
    oauthIpLimitPerMin: parseIntEnv("DISCORD_OAUTH_IP_LIMIT_PER_MIN", 20),
    shutdownGraceMs: 20_000,
    cpBaseUrl: process.env.EMBER_DISCORD_CP_BASE_URL?.trim() ?? "http://127.0.0.1:3000",
    cpServiceBearer: process.env.EMBER_DISCORD_SERVICE_BEARER?.trim() ?? "",
    adapterInternalToken: process.env.EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN?.trim() ?? "",
    archiveWatchHost: process.env.EMBER_ARCHIVE_WATCH_HOST?.trim() || null,
  };
  return { ...base, ...overrides };
}

/** Validates secrets needed to serve interactions (not required in unit tests). */
export function assertInteractionSecrets(_config: AdapterConfig): void {
  requireEnv("DISCORD_PUBLIC_KEY");
  requireEnv("DISCORD_APPLICATION_ID");
}
