# PR registry — one agent, one PR

**Orchestration:** [../BUILD_PHASES.md](../BUILD_PHASES.md) · **Behavior:** [../SPEC.md](../SPEC.md)

| ID | Repo | Branch | Depends on | Blocks | Status | Brief |
|----|------|--------|------------|--------|--------|--------|
| V-1 | [Voxen](https://github.com/Secret-Probation/Voxen) | `docs/discord-pointer-push` | — | — | open | [V-1.md](./V-1.md) |
| CP-1 | [sp-control-plane](https://github.com/Secret-Probation/Bens-control-plane) | — | — | CP-2, CP-3, CP-4, CP-7, AD-5 | **merged** | [CP-1.md](./CP-1.md) |
| CP-2 | sp-control-plane | — | CP-1 | CP-4 | **merged** | [CP-2.md](./CP-2.md) |
| CP-3 | sp-control-plane | — | CP-1 | CP-4 | **merged** | [CP-3.md](./CP-3.md) |
| CP-4 | sp-control-plane | — | CP-1, CP-2, CP-3 | CP-5, CP-6, G2a | **merged** | [CP-4.md](./CP-4.md) |
| CP-5 | sp-control-plane | — | CP-4 | AD-3, G2a | **merged** | [CP-5.md](./CP-5.md) |
| CP-6 | sp-control-plane | — | CP-4 | AD-6, CP-8b | **merged** | [CP-6.md](./CP-6.md) |
| CP-7 | sp-control-plane | — | CP-1 | AD-4, CP-8, G3 | **merged** | [CP-7.md](./CP-7.md) |
| CP-8 | sp-control-plane | `feat/discord-creator-ui` | CP-7, AD-5 | G3 | open | [CP-8.md](./CP-8.md) |
| CP-8b | sp-control-plane | `feat/discord-rollups-ui` | CP-6 | — | optional | [CP-8b.md](./CP-8b.md) |
| CP-9 | sp-control-plane / ops | `feat/discord-hybrid-compose` | AD-7, CP-1 | Pilot | optional | [CP-9.md](./CP-9.md) |
| AD-1 | [ember-discord-adapter](https://github.com/Secret-Probation/ember-discord-adapter) | — | — | AD-2 | **merged** | [AD-1.md](./AD-1.md) |
| AD-2 | ember-discord-adapter | — | AD-1 | AD-3, AD-6, AD-7 | **merged** | [AD-2.md](./AD-2.md) |
| AD-3 | ember-discord-adapter | — | AD-2, CP-4, CP-5 | G2a | **merged** | [AD-3.md](./AD-3.md) |
| AD-4 | ember-discord-adapter | `feat/discord-oauth` | CP-7 | G3 | open | [AD-4.md](./AD-4.md) |
| AD-5 | ember-discord-adapter | — | CP-1 | CP-8 | **merged** | [AD-5.md](./AD-5.md) |
| AD-6 | ember-discord-adapter | `feat/discord-post-to-channel` | AD-2, CP-6 | G4 | open | [AD-6.md](./AD-6.md) |
| AD-7 | ember-discord-adapter | `feat/discord-deploy-metrics` | AD-2 | CP-9, Pilot | open | [AD-7.md](./AD-7.md) |

**Depends on** = all listed PRs must be **merged** to the repo default branch before starting this PR.

Update **Status** to `merged` when the PR lands. Detail: each [brief](./CP-1.md).
