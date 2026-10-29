#!/usr/bin/env bash
# Adapter smoke after deploy (SPEC §19).
# Host: controlplane .206 or BenSpark — cwd ember-discord-adapter
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${ADAPTER_BASE_URL:-http://127.0.0.1:8787}"
BASE_URL="${BASE_URL%/}"
CP_BASE="${EMBER_DISCORD_CP_BASE_URL:-}"
CP_BEARER="${EMBER_DISCORD_SERVICE_BEARER:-}"
SMOKE_GUILD_ID="${SMOKE_GUILD_ID:-9876543210987654321}"

fail() {
  echo "smoke FAIL: $*" >&2
  exit 1
}

sign_body() {
  local body="$1"
  node --input-type=module -e "
    import { signDiscordBody, TEST_PUBLIC_KEY } from '${ROOT}/tests/helpers/discord-sign.ts';
    const envKey = (process.env.DISCORD_PUBLIC_KEY ?? '').trim().toLowerCase();
    if (envKey && envKey !== TEST_PUBLIC_KEY) {
      console.error('DISCORD_PUBLIC_KEY must match test key for automated smoke signing');
      process.exit(2);
    }
    const body = process.argv[1];
    const ts = String(Math.floor(Date.now() / 1000));
    const { signature } = signDiscordBody(body, ts);
    process.stdout.write(signature + '\n' + ts);
  " "${body}"
}

echo "smoke: health ${BASE_URL}/health"
health_code="$(curl -sS -o /tmp/ember_smoke_health.json -w '%{http_code}' "${BASE_URL}/health")"
[[ "${health_code}" == "200" ]] || fail "health returned ${health_code}"

echo "smoke: PING (signed)"
ping_body='{"type":1}'
mapfile -t ping_sign < <(sign_body "${ping_body}")
ping_code="$(curl -sS -o /tmp/ember_smoke_ping.json -w '%{http_code}' \
  -X POST "${BASE_URL}/interactions" \
  -H 'Content-Type: application/json' \
  -H "X-Signature-Ed25519: ${ping_sign[0]}" \
  -H "X-Signature-Timestamp: ${ping_sign[1]}" \
  -d "${ping_body}")"
[[ "${ping_code}" == "200" ]] || fail "PING returned ${ping_code}"
grep -q '"type":1' /tmp/ember_smoke_ping.json || fail "PING body not type 1"

echo "smoke: bad signature → 401"
bad_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${BASE_URL}/interactions" \
  -H 'Content-Type: application/json' \
  -H "X-Signature-Ed25519: aa" \
  -H "X-Signature-Timestamp: ${ping_sign[1]}" \
  -d "${ping_body}")"
[[ "${bad_code}" == "401" ]] || fail "bad signature returned ${bad_code}"

echo "smoke: fan-query defer (search) — use EMBER_DISCORD_CP_STUB=1 or a bound guild"
search_payload="$(node -e "
console.log(JSON.stringify({
  type: 2,
  id: String(Date.now()),
  token: 'smoke-token',
  guild_id: '${SMOKE_GUILD_ID}',
  data: {
    name: 'ember',
    options: [{ name: 'search', type: 1, options: [{ name: 'query', type: 3, value: 'smoke' }] }],
  },
  member: { roles: [], user: { id: '111' } },
}));
")"
mapfile -t search_sign < <(sign_body "${search_payload}")
search_code="$(curl -sS -o /tmp/ember_smoke_search.json -w '%{http_code}' \
  -X POST "${BASE_URL}/interactions" \
  -H 'Content-Type: application/json' \
  -H "X-Signature-Ed25519: ${search_sign[0]}" \
  -H "X-Signature-Timestamp: ${search_sign[1]}" \
  -d "${search_payload}")"
[[ "${search_code}" == "200" ]] || fail "search defer returned ${search_code}"
grep -q '"type":5' /tmp/ember_smoke_search.json || fail "search did not defer (type 5)"

if [[ -n "${CP_BASE}" && -n "${CP_BEARER}" ]]; then
  echo "smoke: CP fan-query bearer (optional)"
  cp_code="$(curl -sS -o /tmp/ember_smoke_cp.json -w '%{http_code}' \
    -X POST "${CP_BASE%/}/api/internal/discord/fan-query" \
    -H "Authorization: Bearer ${CP_BEARER}" \
    -H 'Content-Type: application/json' \
    -d "{\"guild_id\":\"${SMOKE_GUILD_ID}\",\"discord_user_id\":\"111\",\"interaction_id\":\"smoke:1\",\"mode\":\"about\",\"query\":\"\",\"member_role_ids\":[]}")"
  case "${cp_code}" in
    200|404|403) echo "smoke: CP fan-query HTTP ${cp_code}" ;;
    401) fail "CP fan-query returned 401 — check EMBER_DISCORD_SERVICE_BEARER" ;;
    *) echo "smoke WARN: CP fan-query HTTP ${cp_code}" ;;
  esac
else
  echo "smoke SKIP: CP fan-query (set EMBER_DISCORD_CP_BASE_URL + EMBER_DISCORD_SERVICE_BEARER)"
fi

echo "smoke OK"
