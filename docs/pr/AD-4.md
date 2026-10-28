# AD-4 — OAuth (adapter)

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-oauth` |
| **PR title** | `feat(discord): OAuth start and callback` |
| **Depends on** | **CP-7 merged** |
| **Blocks** | End-to-end install |
| **SPEC** | §6 steps 2–3, §12 OAuth IP limit |

## Task prompt

Implement `GET /oauth/start?state=` (validate state with CP or signed state — spec: CP mints state; adapter only redirects if state registered via CP lookup **or** adapter caches states POSTed from CP install flow — prefer: install returns URL with state; adapter trusts state exists when CP will accept callback). Exchange code at callback; fetch guild name with bot token; `POST` CP bindings; redirect browser to fixed CP confirm URL. Discard OAuth access token. Rate limit OAuth paths per IP §12.

## Env

- `DISCORD_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI`, bot token for guild name only on callback path.

## Acceptance checklist

- [ ] Unknown state on `/oauth/start` → 400, no Discord redirect.
- [ ] Callback hits configured confirm URL only.
- [ ] Bot token never sent to CP.

## Test plan

- [ ] §19 OAuth bullets.
