# WAVE 2A — Auth Diagrams (DESIGN ONLY)

## Login → access session → API

```
login {identifier, password} ──► password verify ──► inbox code step ──► redeem
        │                                                          (unchanged)
        ▼
create auth_sessions row (family_id new, refresh_hash=sha256(rand256))
        │
        ├─► Set-Cookie kb_refresh (HttpOnly/Secure/SameSite=Lax)   [web]
        └─► body.refresh_token                                     [native]
        │
        ▼
access JWT {sub, sid, jti, username, iat, exp=15m} ──► memory only (never localStorage)
        │
        ▼
API: Authorization: Bearer ──► get_current_user ──► sig/exp/iss/aud ──► user active ──► sid row active ──► route/service
```

## Refresh → rotation → new access token

```
POST /auth/refresh (+ cookie / body token)
        │
        ▼
sha256(token) ──► lookup row
        ├── missing ──────────────► 401 invalid_grant (login)
        ├── expired ──────────────► 401 (login, purge row)
        ├── revoked ──────────────► 401 (login)
        ├── used + age ≤ 30s ─────► 200 SAME pair (idempotent retry)
        ├── used + age > 30s ─────► REVOKE FAMILY + 401 revoked:true (theft signal)
        └── active ───────────────► mark used, insert new row (same family),
                                    issue new access JWT + rotated refresh ──► 200
```

## Logout → session revocation

```
POST /auth/logout (Bearer) ──► revoke current sid row ──► clear cookie ──► 200
        │
        ├── WS sweep: close sockets(sid) with 4401 ──► client refresh? No: logged out ──► /login
        └── access JWT tail: rejected after ≤15m (sid inactive)

DELETE /auth/sessions/{id} ──► revoke that row only ──► sibling devices unaffected
password change ──► revoke all families EXCEPT current sid
password reset ──► revoke ALL families
```

## WebSocket authentication / reconnect

```
connect wss://…/ws/chat?token=<15m JWT>
        │
        ▼
server: shared predicate (sig/exp + sid active?) ──► no ──► close 1008
        │                                              (client: refresh → reconnect → still bad → /login)
        ▼ yes
manager.attach(socket, user_id, sid) ──► presence online (as today)
        │
        ├── revocation event (logout/reuse/pw-change/reset) ──► sweep closes socket 4401
        │                                                      ──► client: if logged-out → /login
        │                                                          else refresh → connect (backoff kept)
        └── 60s receive-timeout / pong watchdog (unchanged)
```

## Migration state machine (per client)

```
legacy 7d token ──► Phase 2/3: accepted (no sid, iat < cutoff)
        │
        ├── uses /refresh ──► becomes family (gets sid) ──► new regime
        └── never refreshes ──► Phase 5: rejected (cutoff passed) ──► login
```
