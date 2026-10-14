# API (Phase 0)

Base path: `/api/v1`. OpenAPI UI: `/api/docs`.

Errors:

```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "بيانات الدخول غير صحيحة",
  "messageKey": "errors.AUTH_INVALID_CREDENTIALS",
  "details": null
}
```

`message` follows `Accept-Language`. Arabic is the default.

## Health

`GET /api/v1/health`

```json
{
  "status": "ok",
  "service": "api",
  "checks": { "database": "up", "redis": "disabled" }
}
```

`status` is `error` and the HTTP status is 503 when SQL Server is unreachable. Redis is `disabled` until `REDIS_URL` is set, or `down` when it is set and the ping fails. A disabled Redis does not fail the health check in Phase 0.

## Auth

Cookies `dawaa_access` and `dawaa_refresh` are httpOnly. The web app calls these routes on the same origin; Vite proxies `/api` to the Nest process.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | `{ "identifier", "password" }` | Sets cookies. Returns the user, tenant, and branch. |
| `POST` | `/auth/refresh` | empty | Rotates the refresh cookie. |
| `POST` | `/auth/logout` | empty | Revokes the refresh session and clears cookies. |
| `GET` | `/auth/me` | — | Current user, tenant, and branch. Requires the access cookie. |

`identifier` is an email or a Sudan phone in `+249` form.

Login is limited to 10 requests per minute per IP.

## Analytics (internal)

Not public. `GET http://127.0.0.1:8000/health` has no token. Every other route requires header `x-service-token`.

## Print bridge (local)

`GET http://127.0.0.1:9101/health`
