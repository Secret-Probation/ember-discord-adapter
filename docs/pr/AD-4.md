# AD-4 — OAuth (adapter)

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-oauth` |
| **PR title** | `feat(discord): OAuth start and callback` |
| **Depends on** | **CP-7 merged** (bindings + **GET …/oauth/state/{state}**) |
| **Blocks** | G3 |
| **SPEC** | §6 steps 2–3, §12 OAuth IP limit |

## Task prompt

Implement `GET /oauth/start?state=`:

1. Call CP `GET /api/internal/discord/oauth/state/{state}` with service bearer.
2. On **404** or network error → **400**, **no** redirect to Discord.
3. On **200** → redirect to `https://discord.com/oauth2/authorize` with registered redirect URI.

**Do not** trust state from the query alone. **Do not** maintain a local OAuth state cache in v1 (SPEC §6).

Callback: exchange code; fetch guild name with bot token; `POST` CP bindings; redirect browser to fixed CP confirm URL. Discard OAuth access token. OAuth paths rate-limited per IP §12.

## Env

- `DISCORD_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI`, bot token for guild name on callback only.

## Acceptance checklist

- [ ] Unknown/expired/used state → CP 404 → adapter **400**, no Discord redirect.
- [ ] Callback hits configured confirm URL only.
- [ ] Bot token never sent to CP.

## Test plan

- [ ] §19 OAuth bullets with mocked CP state endpoint.
