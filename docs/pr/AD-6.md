# AD-6 — Post to channel

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-post-to-channel` |
| **PR title** | `feat(discord): post-to-channel button and share rollup` |
| **Depends on** | **AD-2 merged**, **CP-6 merged** |
| **Blocks** | — |
| **SPEC** | §11 button, §14 share |

## Task prompt

Handle `MESSAGE_COMPONENT` interactions: `custom_id` `post:{interaction_id}`. 15m in-memory cache keyed by interaction + invoker. Type 4 response without flag 64. On success call CP `POST /api/internal/discord/share`. Wrong user → ignore. Cache miss → ephemeral “Run the command again.” Omit button on error responses.

## Acceptance checklist

- [ ] §19 post tests: type 4, no flag 64 on public post; invoker mismatch blocked.
- [ ] `ember_discord_post_to_channel_total` counter increment.

## Test plan

- [ ] Component handler unit tests.
