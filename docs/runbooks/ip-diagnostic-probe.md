# Runbook — Prove the real client IP behind Railway's edge (`/internal/ip-debug`)

**Audience:** Charlie, or any operator with Railway CLI access to the BOMY project and the `INTERNAL_API_SECRET` value.
**Environment:** **production only** (`@bomy/api` on Railway). The question being answered — how many proxy hops sit in front of the API, and which header survives them — is a property of the production edge and cannot be reproduced locally.
**Owner:** Charlie.
**Last revised:** 2026-07-19

---

## Why this exists

`apps/api` rate limiting (GAPS #3) keys on `request.ip`. Under `trustProxy: 1` that resolves to the **rightmost** `X-Forwarded-For` entry, which on Railway is an **edge-node IP that rotates per connection** — so each fresh connection gets its own bucket and the cap never accumulates. The post-PR #91 prod smoke measured this: 90 bad-signature `POST /webhooks/hitpay` over fresh connections produced **0× 429**, while 40 over a single keep-alive connection produced 429 as expected.

The fix is a `keyGenerator` reading whichever header is (a) stably equal to the real client and (b) not client-spoofable. **Which header that is must be proved, not guessed** — `trustProxy: 2` is a guess. This runbook runs that proof.

**Time-boxed:** the endpoint exists only to answer this question. §5 removes the flag the same session; §8 removes the code. Do not leave it enabled.

---

## §0. Pre-flight

- [ ] PR #92 (or its successor carrying `apps/api/src/routes/internal/ip-debug.ts`) is **merged to `main` and deployed**, and the running deployment contains it.
- [ ] `railway status` shows project **BOMY**, environment **production**. **If the environment is not `production`, stop** — the edge topology is what's under test.
- [ ] **The rollback command exists in your CLI version** — see below. Verify this _before_ enabling anything.
- [ ] You have the production `INTERNAL_API_SECRET` value to hand. Do **not** echo it (see §1).
- [ ] You have recorded your own egress IP from an independent source. This is the expected "real client" value throughout.
- [ ] You are on a stable connection (not switching Wi-Fi/VPN mid-probe) — a changing egress IP invalidates the correlation.

```bash
railway status                            # project + environment
railway logs -s @bomy/api -d --lines 20   # confirm a recent successful boot
curl -s https://api.ipify.org; echo       # your egress IP — record it

# Rollback rehearsal: confirm the disable path exists BEFORE enabling.
railway variable delete --help            # must print usage, not "unrecognized subcommand"
```

> **`railway status` shows `@bomy/admin` as the linked service — that is expected and irrelevant here.** The linked service is a directory association; **every command below targets the API explicitly with `--service @bomy/api --environment production`**. Never rely on the link. Omitting `--service` would operate on `@bomy/admin` — the wrong service.

> **CLI version:** the commands below are verified against **Railway CLI 5.18.0**. Flag names have already churned once in this area (`--unset` does not exist despite a legacy `--set` that does). If your CLI differs and the rehearsal above fails, **stop and re-derive the disable command from `railway variable --help` before enabling** — an enable you cannot reverse is the one outcome this runbook must never produce.

> **Not a pre-flight check:** there is no way to verify the endpoint responds before enabling the flag. While disabled the route is not registered, so it is byte-identical to any unrouted path (that is the intended behaviour, tested in `apps/api/tests/routes/internal/ip-debug.test.ts`). A 404 at this stage proves nothing either way.

---

## §1. Secret handling (read before running anything)

The bearer token must not land in shell history, logs, or evidence.

```bash
# Leading space keeps this out of history in bash (HISTCONTROL=ignorespace)
# and zsh (setopt histignorespace). Verify your shell honours it, or use the
# read -rs form below, which never puts the value on a command line at all.
 read -rs IP_DEBUG_SECRET && export IP_DEBUG_SECRET
```

Rules:

- Reference it only as `$IP_DEBUG_SECRET`. Never type the literal value into a command.
- **Never** pass it via `curl -v` output, `set -x`, or a `--trace` flag — all echo headers.
- **Never run `railway variable list` with `--kv` or `--json` on `@bomy/api`, and never paste its output anywhere.** Both print **raw values** — that dumps `INTERNAL_API_SECRET`, `HITPAY_SALT`, `AUTH_SECRET` and the database URL in one go. When you need to check a single key, grep for that key alone (§5).
- `unset IP_DEBUG_SECRET` when done (§5).
- Nothing containing the token — request headers, verbose curl output — goes into the evidence file. See §7.

---

## §2. Enable the diagnostic

**Requires Charlie's explicit go.** This is a production environment change.

```bash
railway variable set ENABLE_IP_DIAGNOSTIC=1 \
  --service @bomy/api --environment production
```

Do **not** add `--skip-deploys` — the redeploy is what makes the flag take effect.

Railway redeploys the service on a variable change. Wait for the new deployment to be healthy before probing:

```bash
railway logs -s @bomy/api -d --lines 20
curl -s -o /dev/null -w "%{http_code}\n" https://bomyapi-production.up.railway.app/health   # expect 200
```

Record the deployment id — probes must be correlated against the deployment that served them.

---

## §3. Probe A — normal request

From the machine whose egress IP you recorded in §0:

```bash
curl -s -H "Authorization: Bearer $IP_DEBUG_SECRET" \
  https://bomyapi-production.up.railway.app/internal/ip-debug | tee probe-a.json
```

Expect HTTP 200 and a JSON body with the nine fields. Immediately capture the matching edge log line — **this is the ground truth**:

```bash
railway logs -s @bomy/api --http --json -n 20
```

Find the line whose path is `/internal/ip-debug`. Its **`srcIp` is the real client** as Railway's edge saw it.

**Record, per field:** which of `requestIp`, `xForwardedFor` (and each position within it), `xRealIp`, `xEnvoyExternalAddress`, `fastlyClientIp` equals the §0 egress IP, and which equal something else (an edge IP, typically `152.233.x.x` / DataPacket SG).

> **Note:** `requestIps` is **truncated by `trustProxy: 1`** to the socket plus the single trusted hop — left-hand entries are dropped. Read the position of the real client from the **raw `xForwardedFor` string**, not from `requestIps`.

Repeat this probe **at least 3 times over fresh connections** (`curl` without `--keepalive-time`, separated by a few seconds). A field is only a viable rate-limit key if it is **stable across all runs**. A field that changes per connection is the bug we already have.

---

## §4. Probe B — spoof attempt

Same request, but supplying the client headers ourselves. This establishes whether an attacker can control the candidate key.

```bash
curl -s -H "Authorization: Bearer $IP_DEBUG_SECRET" \
  -H "X-Forwarded-For: 203.0.113.1" \
  -H "X-Real-IP: 203.0.113.1" \
  -H "X-Envoy-External-Address: 203.0.113.1" \
  https://bomyapi-production.up.railway.app/internal/ip-debug | tee probe-b.json
```

`203.0.113.0/24` is TEST-NET-3 (RFC 5737) — reserved for documentation, so it can never collide with a real client.

Capture the matching edge log line again.

**Capture only — do not analyse yet.** You now hold everything the analysis needs (both probe bodies and both edge log lines). Go straight to §5 and turn the endpoint off. Analysis is §6 and happens against the saved captures, with the endpoint already disabled.

---

## §5. Disable immediately (mandatory, same session)

Run this **as soon as §4's capture is saved** — before reading the results, before writing anything up, before forming any conclusion. Analysis is unbounded in time; the exposure window must not be.

```bash
railway variable delete ENABLE_IP_DIAGNOSTIC \
  --service @bomy/api --environment production
unset IP_DEBUG_SECRET
```

Wait for the redeploy, then confirm the endpoint is gone:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bomyapi-production.up.railway.app/health   # expect 200
curl -s https://bomyapi-production.up.railway.app/internal/ip-debug                          # expect the standard Fastify 404 body

# Confirm the variable itself is gone. Grep for the single key — never dump the
# whole list with --kv/--json, which prints every secret in raw form (§1).
railway variable list --service @bomy/api --environment production | grep -c ENABLE_IP_DIAGNOSTIC   # expect 0
```

The 404 response must be the ordinary not-found payload (`{"message":"Route GET:/internal/ip-debug not found","error":"Not Found","statusCode":404}`) — the same body any unrouted path returns.

**If the delete fails or the variable is still present:** you are in the one state this runbook must never leave behind. Retry; if it still fails, remove the variable from the Railway dashboard UI directly, and do not stop working until a probe returns the standard 404.

**Rollback is this same section** — the endpoint is read-only, touches no database, and holds no state, so there is nothing else to undo. If anything looks wrong at any point in §2–§4 — unexpected status codes, the wrong deployment serving traffic, an unstable egress IP — run §5 immediately and restart from §0.

---

## §6. Analysis (endpoint already disabled)

Only now, against the saved captures.

A candidate header is usable as the rate-limit key **only if all three hold**:

1. **Correct** — in Probe A it equals the §0 egress IP and the edge log's `srcIp`.
2. **Stable** — identical across all Probe A repetitions over fresh connections.
3. **Not spoofable** — in Probe B, `203.0.113.1` does **not** appear in it. Railway either stripped or overwrote the caller-supplied value.

**If a header satisfies 1 and 2 but fails 3, it is disqualified as a key** — using it would let anyone bypass the limiter by rotating the header, which is strictly worse than today's behaviour.

**If no header satisfies all three:** the endpoint is already off (§5) — confirm that, then stop and escalate. Do not implement a keying change. Options to weigh at that point (out of scope here): rate-limit at the Railway/Cloudflare edge instead of in-app, or key on something other than IP for the endpoints that matter.

If Probe B shows the spoofed value landing in `requestIp`, note it explicitly — that means the **current production limiter is also spoofable**, which raises GAPS #3's severity and should be reported before the fix PR.

**If the captures turn out to be inconclusive or unusable, do not re-enable ad hoc.** Restart cleanly from §0, including a fresh §2 enable — a second exposure window is acceptable; an unbounded first one is not.

---

## §7. Evidence

One committed file: `docs/runbooks/evidence/YYYY-MM-DD_ip-diagnostic-probe_prod.md`.

```markdown
# IP diagnostic probe evidence — prod — YYYY-MM-DD

**Actor:** <email>
**Deployment id:** <from §2>
**Operator egress IP (§0, independent source):** <ip>
**Started / completed:** YYYY-MM-DDTHH:MM:SSZ / YYYY-MM-DDTHH:MM:SSZ

## §3 Probe A — normal (3+ runs, fresh connections)

<paste each response body; note which fields changed between runs>

### Matching edge log lines (srcIp = ground truth)

<paste the srcIp / edgeRegion / deploymentId fields only>

## §4 Probe B — spoof attempt

<paste response body + matching edge log line>

## §5 Disable confirmation

<paste the `variable delete` output, the post-disable 404 body, and the grep -c result (expect 0)>

**Disabled at:** YYYY-MM-DDTHH:MM:SSZ — must be BEFORE the analysis timestamp below.

## §6 Analysis (performed after the disable above)

**Analysed at:** YYYY-MM-DDTHH:MM:SSZ

| Header | Correct (== egress & srcIp) | Stable across runs | Not spoofable | Usable as key |
| ------ | --------------------------- | ------------------ | ------------- | ------------- |
| ...    |                             |                    |               |               |

**Conclusion:** <chosen header + the trustProxy/keyGenerator change it implies, or "no viable header — escalated">
```

### Redaction (apply BEFORE committing)

- **NEVER commit:** `INTERNAL_API_SECRET` or any `Authorization` header; verbose curl output (`-v`, `--trace`) — it echoes request headers; full `railway logs` dumps — they contain unrelated production traffic, including other users' IPs.
- **OK to commit:** the operator's own egress IP (Charlie's, knowingly disclosed), Railway edge IPs, the TEST-NET-3 spoof value, `deploymentId`, `edgeRegion`, and the probe response bodies — the endpoint returns only IP/proxy metadata by construction.
- **REDACT** any third-party client IP that appears incidentally in a copied log line — `[REDACTED]`.

---

## §8. Endpoint removal gate

The probe is not finished when the flag is off. GAPS #3 closes only when **all** of these are true:

1. The keying fix has landed, using the header proved in §4 — not a guessed `trustProxy: N`.
2. **`apps/api/src/routes/internal/ip-debug.ts`, its test file, its `server.ts` registration, and the `ENABLE_IP_DIAGNOSTIC` entry in `apps/api/.env.example` are all deleted.** The endpoint is temporary by design; a merged diagnostic that outlives its investigation is a standing liability.
3. The re-run prod smoke passes: bad-signature `POST /webhooks/hitpay` over **fresh** connections now returns 429 past the ~30 cap.
4. `ENABLE_IP_DIAGNOSTIC` is confirmed absent from the Railway service variables:
   `railway variable list --service @bomy/api --environment production | grep -c ENABLE_IP_DIAGNOSTIC` returns `0`.
   (Never dump the list with `--kv`/`--json` — see §1.)
5. This runbook is deleted in the same PR, and the GAPS #3 entry updated to closed citing the evidence file.
