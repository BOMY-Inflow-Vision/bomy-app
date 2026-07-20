# IP diagnostic probe evidence — prod — 2026-07-20

**Actor:** Charlie (probe executed by Andy under explicit authorisation)
**Deployment id (probe window):** `adfc4364-…`, commit `0bb82bd` (PR #92 merge)
**Operator egress IP:** `[OPERATOR-EGRESS]` — a stable TTNET Malaysia address, redacted throughout. Verified against `api.ipify.org` before the probe and identical in every capture below.
**Started / completed:** 2026-07-20T03:14:39Z / 2026-07-20T03:59:52Z

> **Redaction note:** the operator's egress IP is replaced with `[OPERATOR-EGRESS]` everywhere. Railway edge IPs, the TEST-NET-3 spoof values, and request ids are committed as-is — they are infrastructure, not personal data.

---

## §3 Probe A — normal (3 runs, fresh connections)

| Run | `requestIp`      | `xRealIp`           | `xForwardedFor` (raw)               | `socketRemoteAddress` |
| --- | ---------------- | ------------------- | ----------------------------------- | --------------------- |
| A1  | `152.233.15.121` | `[OPERATOR-EGRESS]` | `[OPERATOR-EGRESS], 152.233.15.121` | `100.64.0.3`          |
| A2  | `152.233.15.120` | `[OPERATOR-EGRESS]` | `[OPERATOR-EGRESS], 152.233.15.120` | `100.64.0.4`          |
| A3  | `152.233.15.123` | `[OPERATOR-EGRESS]` | `[OPERATOR-EGRESS], 152.233.15.123` | `100.64.0.5`          |

`xEnvoyExternalAddress`, `fastlyClientIp` were `null` on all three. `xRailwayEdge` was `sin1` on all three.

**`requestIp` changed on every single request.** That is the GAPS #3 bug reproduced directly: the rate-limit key never repeats, so the cap cannot accumulate.

### Matching edge log lines (srcIp = ground truth)

```
2026-07-20T03:17:40 | srcIp=[OPERATOR-EGRESS] | edgeRegion=asia-southeast1-eqsg3a | status=200
2026-07-20T03:17:43 | srcIp=[OPERATOR-EGRESS] | edgeRegion=asia-southeast1-eqsg3a | status=200
2026-07-20T03:17:46 | srcIp=[OPERATOR-EGRESS] | edgeRegion=asia-southeast1-eqsg3a | status=200
```

## §4 Probe B — spoof attempts

| Run | Headers sent by caller                                             | `requestIp`      | `xRealIp`           | `xEnvoyExternalAddress` | `xForwardedFor` (raw)               |
| --- | ------------------------------------------------------------------ | ---------------- | ------------------- | ----------------------- | ----------------------------------- |
| B1  | `XFF: 203.0.113.1`, `X-Real-IP: 203.0.113.1`, `Envoy: 203.0.113.1` | `152.233.15.121` | `[OPERATOR-EGRESS]` | **`203.0.113.1`**       | `[OPERATOR-EGRESS], 152.233.15.121` |
| B2  | `X-Real-IP: 203.0.113.2` only                                      | `152.233.68.98`  | `[OPERATOR-EGRESS]` | `null`                  | `[OPERATOR-EGRESS], 152.233.68.98`  |
| B3  | `XFF: 203.0.113.3, 203.0.113.4, 203.0.113.5`                       | `152.233.68.98`  | `[OPERATOR-EGRESS]` | `null`                  | `[OPERATOR-EGRESS], 152.233.68.98`  |

```
2026-07-20T03:19:05 | srcIp=[OPERATOR-EGRESS] | edgeRegion=asia-southeast1-eqsg3a | status=200
2026-07-20T03:19:07 | srcIp=[OPERATOR-EGRESS] | edgeRegion=asia-southeast1-eqsg3a | status=200
2026-07-20T03:19:10 | srcIp=[OPERATOR-EGRESS] | edgeRegion=asia-southeast1-eqsg3a | status=200
```

**Railway overwrites both `X-Forwarded-For` and `X-Real-IP` wholesale.** B3 sent a three-entry XFF chain; the app saw a clean two-entry `[client], [edge]`. No caller-supplied value survived in either header.

**`X-Envoy-External-Address` passed through untouched** — it is fully client-controlled and must never be trusted.

## §5 Disable confirmation

**Disabled at:** 2026-07-20T03:59:52Z — before the analysis below.

```
$ curl -s https://bomyapi-production.up.railway.app/internal/ip-debug
{"message":"Route GET:/internal/ip-debug not found","error":"Not Found","statusCode":404}

$ railway variable list --service @bomy/api --environment production | grep -c ENABLE_IP_DIAGNOSTIC
0

$ curl -s .../health   → 200    $ curl -s .../ready → 200
```

Confirmed four times, including once with an `Authorization` header present — the standard not-found body every time, byte-identical to any unrouted path.

### ⚠️ Deviation — the disable took ~45 min, not ~5

**`railway variable delete` does NOT trigger a redeploy.** The variable vanished from the Railway config immediately, but the running container kept `ENABLE_IP_DIAGNOSTIC=1` in its boot environment, so **the endpoint stayed live and answering `401` while the config claimed it was gone.** `railway restart --yes` hung without effect. What worked: `railway variable set ENABLE_IP_DIAGNOSTIC=0` (a _set_ does trigger a redeploy, and `0` fails the `!== "1"` check on both gates), then deleting the variable afterwards — the running container keeps `0`, and any future deploy sees no variable at all.

Exposure window was ~45 minutes instead of the intended ~5. No unauthorised access is possible in that window (the bearer gate held throughout), but the runbook's §5 was wrong and has been corrected.

**The §5 confirm step is what caught this.** Had the runbook trusted the delete command's exit code, production would have been left with a live diagnostic endpoint and a config file insisting otherwise.

## §6 Analysis (performed after the disable above)

**Analysed at:** 2026-07-20T04:05Z

| Header                     | Correct (== egress & srcIp) | Stable across runs  | Not spoofable            | Usable as key         |
| -------------------------- | --------------------------- | ------------------- | ------------------------ | --------------------- |
| `X-Real-IP`                | ✅ yes                      | ✅ yes (1 distinct) | ✅ yes (overwritten)     | **✅ YES**            |
| `X-Forwarded-For` leftmost | ✅ yes                      | ✅ yes              | ✅ yes (overwritten)     | ⚠️ viable, positional |
| `request.ip` (current)     | ❌ no (edge IP)             | ❌ no (4 distinct)  | ✅ n/a                   | ❌ no                 |
| `X-Envoy-External-Address` | ❌ no                       | ❌ no               | ❌ **client-controlled** | ❌ **never**          |
| `socket.remoteAddress`     | ❌ no (`100.64.0.x` CGNAT)  | ❌ no (6 distinct)  | ✅ n/a                   | ❌ no                 |

**Conclusion: key the rate limiter on `X-Real-IP`.**

It is the only header that satisfies all three criteria outright. Railway sets it to the real client and overwrites any caller-supplied value (proved in B1 and B2).

`X-Forwarded-For` leftmost is equally correct and equally unspoofable, but requires positional parsing and silently degrades to an edge IP if Railway ever inserts another hop. `X-Real-IP` is a single unambiguous value with no positional assumption. **`trustProxy: 2` would work today** — XFF was exactly two entries every time — **but it is precisely the hop-count guess this probe existed to avoid**, and it breaks silently if the chain length changes.

Recommended change (next PR): a `keyGenerator` on `X-Real-IP` with a documented fallback, keeping #91's Redis store, then re-smoke fresh connections and confirm 429 past ~30.
