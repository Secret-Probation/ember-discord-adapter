/** Discord OAuth2 helpers for guild install (SPEC §6). */

const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";

/** View Channel + Send Messages + Embed Links (SPEC §5). */
export const DISCORD_INSTALL_PERMISSIONS = "19456";

export type OAuthTokenExchangeResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "http_error" | "invalid_response" };

/** Build browser redirect URL for bot + applications.commands install. */
export function buildDiscordAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(DISCORD_AUTHORIZE);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", DISCORD_INSTALL_PERMISSIONS);
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** Exchange authorization code; caller must discard access token after use (SPEC §6). */
export async function exchangeOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthTokenExchangeResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  let res: Response;
  try {
    res = await fetchFn(DISCORD_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { ok: false, reason: "http_error" };
  }

  if (!res.ok) {
    return { ok: false, reason: "http_error" };
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token || typeof json.access_token !== "string") {
    return { ok: false, reason: "invalid_response" };
  }
  return { ok: true, accessToken: json.access_token };
}
