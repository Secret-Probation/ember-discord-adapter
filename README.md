# ember-discord-adapter

Official **Ember Discord adapter service** — HTTP Interactions, OAuth install, `/ember search|ask|about` over released show archives.

| Tier | Role |
|------|------|
| [Voxen](https://github.com/Secret-Probation/Voxen) | Transcription (unchanged) |
| Control plane | Guild binding, fan-query, billing, daily cap |
| **ember-discord-adapter** | Discord protocol, defer/edit, embeds, bot token |
| [Ember](https://github.com/Secret-Probation/Ember) | Search / Ask engine (unchanged) |

**Spec:** [docs/SPEC.md](docs/SPEC.md) (accepted 2026-10-28)  
**Multi-agent PR plan:** [docs/BUILD_PHASES.md](docs/BUILD_PHASES.md) · **PR briefs:** [docs/pr/README.md](docs/pr/README.md)

## Development

```bash
npm install
npm test
EMBER_DISCORD_CP_STUB=1 DISCORD_PUBLIC_KEY=… DISCORD_APPLICATION_ID=… npm run dev
```

`POST /interactions` and `GET /health` are implemented (§22.2). Webhook edit + formatter wiring land in §22.5–6.

### Listeners (SPEC §4)

| Env | Default | Serves |
|-----|---------|--------|
| `PUBLIC_HOST` + `PORT` | `0.0.0.0:8787` | `GET /health`, `POST /interactions`, OAuth (later) |
| `INTERNAL_HOST` + `INTERNAL_PORT` | `127.0.0.1:8788` | `POST /internal/guilds/{id}/leave`, `GET …/roles` |

The public listener returns **404** for `/internal/*`. Only the internal bind address (docker network on `.206`) should reach CP→adapter routes. Auth: `Authorization: Bearer` = `EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN`. Discord API calls use `DISCORD_BOT_TOKEN` on the adapter only.

## Hosts

| Host | Role |
|------|------|
| controlplane `.206` | Adapter container + CP internal API |
| BenSpark `.66` | Dev tunnels to adapter |

## Repo

https://github.com/Secret-Probation/ember-discord-adapter

## License

Apache-2.0
