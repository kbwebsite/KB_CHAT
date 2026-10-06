# WAVE 2A — Threat Model (DESIGN ONLY, 2026-10-06 UTC)

Priority: **P0** = blocks production use · **P1** = harden in auth wave ·
**P2** = later wave / defense-in-depth. Residual risk assumes the §4-D design
(hybrid short-JWT + rotating server refresh) is implemented.

| Threat | Current exposure (evidence) | Mitigation (proposed) | Residual risk | Priority |
|---|---|---|---|---|
| XSS token theft | **High**: 7-day Bearer in `localStorage` (`auth.ts:20-21`); any injected script exfils and impersonates for days | Access token memory-only + 15-min TTL; refresh in `HttpOnly` cookie (web) | XSS can still ride live session / steal refresh *use* via forged requests — mitigated by rotation+reuse detection, not eliminated | P0 |
| Refresh-token theft (cookie) | n/a today (no refresh) | `HttpOnly+Secure+SameSite=Lax`, POST-only endpoint, Origin check, rotation; native body-token in app sandbox | Malware/device-read or physical access still wins | P0 |
| Token replay (access) | 7-day window, undetectable | 15-min window; `jti` logged; reuse of revoked `sid` rejected | ≤15 min post-logout use remains by design | P0 |
| Refresh reuse | n/a | Rotation + 30 s grace; out-of-grace reuse ⇒ **family revoked**, alert event | Attacker racing the legitimate client triggers logout (fail-closed, visible) | P0 |
| CSRF on cookie endpoints | Low today (Bearer, no cookies) — would newly apply to `/refresh` | `SameSite=Lax` + POST-only + Origin/Referer check; no state-changing GETs on cookies | Cross-site POST from an allowed origin context; residual low | P0 |
| Session fixation | n/a (token minted fresh each login) | New family per login; never accept client-provided session id | None if implemented | P1 |
| Logout / revocation | **Broken**: logout flips presence only (`auth.py:238-245`); token valid to `exp` | Revoke row on logout; `sid` check per request/connect; WS sweep closes sockets | ≤15 min access tail; documented | P0 |
| Password-change invalidation | None: sessions survive change | Revoke all families except current `sid` in the same transaction | Attacker holding current-session cookie pre-change keeps 15 min — acceptable | P0 |
| Password-reset invalidation | None | Revoke **all** families on reset | Same 15-min tail | P0 |
| Concurrent refresh (tabs/race) | n/a | Single-flight queue client-side; server grace returns same pair; first-writer-wins | Double-revoke storm if grace misconfigured — covered by concurrency tests | P1 |
| Multiple tabs | Shared `localStorage` token today | Shared cookie + single-flight refresh queue | Tab A logout kills tab B (correct); UX copy must say so | P1 |
| Multiple devices | Indistinguishable tokens; per-device logout impossible | One family per device; per-row revoke; sessions UI | Stale device names (user-supplied strings) — cosmetic | P0 |
| Expired access token | Treated as dead → full re-login | Refresh queue retries once, then login redirect (existing 401 path) | Clock skew: allow 30 s `leeway` on `exp` | P1 |
| Expired refresh token | n/a | 401 `invalid_grant` → login; purge job removes row | None | P1 |
| WS authentication | Token in URL (`chat.py:31-56`), validated once, never re-checked | Short JWT + connect-time `sid` check + revocation sweep (`4401`) + refresh-then-reconnect client | URL logging of 15-min tokens; residual low | P0 |
| Brute-force login | 30/min in-memory limiter only (`main.py:371-376`); no lockout; per-worker | Keep limiter + add per-account backoff/lockout counters (DB-backed, Wave 2 impl) + keep code-step second factor | Credential stuffing with correct passwords still possible — inherent | P1 |
| Account enumeration | `/users/search` + distinct login errors partially leak; signup/login messages generic (good) | Neutral error strings on refresh/session endpoints; keep generic `Invalid credentials`; rate-limit sessions list | Search enumeration is product surface (accepted) | P2 |
| Compromised device | Total: token + refresh + data | Per-device revoke from another device; family-revoke on reuse; password reset kills all; absolute refresh cap (OD-3) bounds dormancy | Data already on device is exposed — MDM/wiped beyond scope | P0 |

## Cross-cutting notes

- **Fail-closed bias**: every ambiguous case (reuse outside grace, missing Origin,
  cutoff-past legacy token) denies and forces re-login. False logouts are
  visible; silent acceptances are not.
- **Observability gap (carries over)**: reuse/revoke events need a destination
  better than `print()` (OD-7); without it, theft detection is write-only.
- **Biggest residual overall**: XSS still defeats everything client-side —
  the design shrinks theft *value* (15-min memory token) and makes refresh theft
  *loud* (family revoke), but script injection remains P0 to prevent (CSP,
  dependency hygiene — outside this wave).
