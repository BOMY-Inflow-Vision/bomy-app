# Rate-limit re-smoke evidence — prod — 2026-07-22

**Actor:** Charlie (smoke executed by Andy under explicit approval, post-#98 merge)
**Deployment:** `a67a2153`, commit `a491fdd` (PR #98 merge), `SUCCESS`
**Operator egress IP:** `[OPERATOR-EGRESS]` — same stable address used in the 2026-07-20 probe, redacted throughout.
**Started / completed:** 2026-07-22T17:20:14Z / 2026-07-22T17:20:26Z

> **Redaction note:** operator egress IP replaced with `[OPERATOR-EGRESS]` everywhere. Railway edge-log fields (`srcIp`, `edgeRegion`, timestamps, status codes) are committed as infrastructure.

---

## Purpose

Confirm the `X-Real-IP` keying fix (PR #98) actually binds in production — the exact scenario that failed under the old `request.ip` keying (GAPS #3, 2026-07-19 status): **fresh connections must accumulate against one bucket**, not mint a new one each time.

## Method

35 sequential `curl` invocations against `POST /webhooks/hitpay`, each its own fresh TCP connection (no `--keepalive-time`, no connection reuse — same method as the original bug-reproduction smoke), each carrying a deliberately bad `Hitpay-Signature` header so the request fails HMAC verification but still consumes the rate-limit bucket before that check. `HITPAY_WEBHOOK_RATE_LIMIT_MAX = 30`.

## Result: PASS

```
requests 1–30:  401 (HMAC failure — expected; consumes the bucket)
requests 31–35: 429 (rate limited)
```

First `429` at request **31** — exactly one past the 30 cap. 30 × 401 then 429 onward, no gaps, no early trips.

### Matching edge log (ground truth)

```
2026-07-22T17:20:16Z srcIp=[OPERATOR-EGRESS] status=401 edge=asia-southeast1-eqsg3a
2026-07-22T17:20:17Z srcIp=[OPERATOR-EGRESS] status=401 edge=asia-southeast1-eqsg3a
  … (28 more 401s, same srcIp, same edge) …
2026-07-22T17:20:25Z srcIp=[OPERATOR-EGRESS] status=429 edge=asia-southeast1-eqsg3a
2026-07-22T17:20:25Z srcIp=[OPERATOR-EGRESS] status=429 edge=asia-southeast1-eqsg3a
2026-07-22T17:20:26Z srcIp=[OPERATOR-EGRESS] status=429 edge=asia-southeast1-eqsg3a
2026-07-22T17:20:26Z srcIp=[OPERATOR-EGRESS] status=429 edge=asia-southeast1-eqsg3a
2026-07-22T17:20:26Z srcIp=[OPERATOR-EGRESS] status=429 edge=asia-southeast1-eqsg3a
```

`srcIp` is the same real client across every single request (as it always was — Railway's edge always saw the true client correctly; the 2026-07-19 bug was purely in which value the **app** chose to key on). The app-level `request.ip` that used to rotate per connection is no longer inspectable — the diagnostic endpoint that exposed it was removed in this same PR — but the accumulation result above is the actual thing that matters: the limiter now counts these 35 fresh connections as one client, where before it counted each as a different one.

## Post-smoke verification

```
$ curl -s .../health   → 200
$ curl -s .../internal/ip-debug → {"message":"Route GET:/internal/ip-debug not found","error":"Not Found","statusCode":404}
```

Diagnostic endpoint confirmed removed from the running deployment (standard Fastify 404, not the app's old custom body).

## Conclusion

**GAPS #3 `apps/api` keying: CLOSED.** The webhook route now enforces its cap across fresh connections in production, matching the design. Web server-action throttling remains a separate, still-open item — see GAPS.md #3.
