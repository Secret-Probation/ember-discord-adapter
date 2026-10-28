# AD-5 — Internal leave + roles

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-internal-routes` |
| **PR title** | `feat(discord): internal leave guild and list roles` |
| **Depends on** | **CP-1** env contract (`EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN`) |
| **Blocks** | CP-8 roles picker |
| **SPEC** | §4 private routes, §7.2 roles |

## Task prompt

Add `POST /internal/guilds/{guild_id}/leave` and `GET /internal/guilds/{guild_id}/roles` on adapter, docker-network only, bearer `EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN`. Leave uses bot token `DELETE /users/@me/guilds/{id}`. Roles uses bot token to list guild roles (id + name). Never expose on public listener.

## Acceptance checklist

- [ ] Wrong bearer → 401.
- [ ] Public port cannot hit `/internal/*` (document bind address in README).

## Test plan

- [ ] Auth tests with supertest or raw http.
