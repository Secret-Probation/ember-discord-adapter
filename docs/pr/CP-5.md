# CP-5 — Internal Ask poll

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-ask-poll` |
| **PR title** | `feat(discord-cp): GET /api/internal/discord/ask/jobs/{id}` |
| **Depends on** | **CP-4 merged** |
| **Blocks** | AD-3 |
| **SPEC** | §7.1 step 10 |

## Task prompt

Add `GET /api/internal/discord/ask/jobs/{askJobId}?guild_id=&interaction_id=` with service bearer. Scope job to binding org/project, surface `public`, `query_id === discord:{interaction_id}`. Return `buildEmberAskPollBody` + `sanitizePublicAskJobStoredResult`. Apply `discord:poll:${guildId}` rate limit. Wrap with `withEmberBffMetrics` `surface: "discord"`.

## Out of scope

- Fan-query changes except shared helpers.

## Acceptance checklist

- [ ] Wrong interaction_id → 404.
- [ ] Wrong guild / inactive binding → 404.
- [ ] Sanitized payload (no staff fields).

## Test plan

- [ ] Route tests mirroring `archive/[token]/ask/jobs/[id]/route.test.ts` patterns.
