# AD-2 — Webhook edits + formatter

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-webhook-formatter` |
| **PR title** | `feat(discord): webhook PATCH and embed formatter` |
| **Depends on** | **AD-1** on `main`; soft dependency CP-4 for live JSON shape |
| **Blocks** | AD-3, AD-6, AD-7 |
| **SPEC** | §11, §13 |

## Task prompt

After deferred ack, implement Discord **interaction webhook** client: `PATCH /webhooks/{application_id}/{token}/messages/@original` (not bot token). Build formatter for search (≤5 moments), ask (≤3 citations), about, and fixed error copy for 402/403/404/429. Use `sanitizeFanText`, `isAllowedWatchUrl`, embed limits. `allowed_mentions: { parse: [] }`. Map CP `FanQueryResult` errors to ephemeral edits. Comment in handler: do not use discord.js followUp pattern (§11). Wire `runDeferredCommand` to edit thinking message. Unit tests with mocked fetch.

## Likely touchpoints

- `src/discord/webhook.ts`
- `src/format/embed.ts`
- `src/interactions/handler.ts`
- `src/cp/error-map.ts`
- `tests/format-embed.test.ts`, `tests/webhook.test.ts`

## Out of scope

- Ask poll loop (AD-3).
- Post-to-channel button and **`MESSAGE_COMPONENT`** handling (AD-6).
- OAuth (AD-4).

## Acceptance checklist

- [ ] §19: 404/402/429/403 fixed copy; watch_url allowlist; mention strip; embed caps.
- [ ] 19-digit snowflake stays string in formatter paths.
- [ ] Retry edit twice then fallback POST per §11 (implement or ticket with TODO blocked on test harness).

## Test plan

- [ ] `npm test` green.
- [ ] Manual: stub CP returns sample search payload → embed renders.
