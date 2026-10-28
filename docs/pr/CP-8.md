# CP-8 — Creator UI (Connect + confirm)

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-creator-ui` |
| **PR title** | `feat(discord-cp): Discord Connect panel on show dashboard` |
| **Depends on** | **CP-7 merged**, **AD-5 merged** (for roles proxy) |
| **Blocks** | Gate **G3** |
| **SPEC** | §6 Creator UI |

## Task prompt

Add Discord panel near `FanArchiveLinkPanel`: Connect (install → redirect), pending state, confirm link to CP page, connected guild name, Ask role picker (`GET …/discord/roles`), unlink. Respect `EMBER_DISCORD_ENABLED`. Owner/Admin only for mutating actions.

## Out of scope

- Rollups charts (CP-8b).
- GTM doc edit.

## Acceptance checklist

- [ ] Flag off hides Connect.
- [ ] Editor cannot connect.
- [ ] Unlink calls DELETE show discord.

## Test plan

- [ ] Route tests for install auth where feasible; manual QA note for UI.
