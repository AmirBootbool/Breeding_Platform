# Security Configuration Status

> Last updated: 2026-07-03

## Implemented Fixes

All 8 original security items have been addressed in `backend/config/settings.py`.

### 1. ✅ SECRET_KEY — Secure Key Management
Loaded from environment via `config('DJANGO_SECRET_KEY', default=None)`. When the key is
missing and `DEBUG=True`, an insecure fallback is used for local development. When missing
and `DEBUG=False`, a `ValueError` is raised to prevent production starts without a real key.

### 2. ✅ DEBUG — Defaults to False
Set via `config('DJANGO_DEBUG', default=False, cast=bool)`. Production environments get
`DEBUG=False` by default; developers must explicitly opt in.

### 3. ✅ ALLOWED_HOSTS — No Wildcard
Configured via `config('DJANGO_ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=lambda v: [...])`.
The default restricts access to localhost only; production values must be set explicitly in the
environment.

### 4. ✅ Password Validators — Strong Policy
Four validators enabled:
- `UserAttributeSimilarityValidator`
- `MinimumLengthValidator` (minimum 12 characters)
- `CommonPasswordValidator`
- `NumericPasswordValidator`

### 5. ✅ REST Framework — Auth & Pagination Defaults
```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [SessionAuthentication, TokenAuthentication],
    "DEFAULT_PERMISSION_CLASSES": [IsAuthenticated],
    "DEFAULT_PAGINATION_CLASS": PageNumberPagination,  # page_size=100
    "DEFAULT_FILTER_BACKENDS": [SearchFilter, OrderingFilter],
}
```

### 6. ✅ CORS — Restricted Origins
`CORS_ALLOWED_ORIGINS` loaded from environment, defaults to `http://localhost:3000`.
`CORS_ALLOW_CREDENTIALS = True` to support cookie-based auth from the frontend.

### 7. ✅ Token Authentication
`rest_framework.authtoken` added to `INSTALLED_APPS`. Token endpoint exposed at
`api/auth/token/`.

### 8. ✅ Security Headers & HTTPS Settings
- `SECURE_BROWSER_XSS_FILTER = True`
- `SECURE_CONTENT_SECURITY_POLICY` configured.
- HTTPS cookie settings (`SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`,
  `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`) are enabled only when `DEBUG=False`.

---

## Remaining Work

| # | Item | Notes |
|---|------|-------|
| 1 | **WhiteNoise for static files** | `STATIC_URL = '/static/'` is set but WhiteNoise middleware is not installed. Required for serving static files in production without a separate web server. |
| 2 | **`STATIC_ROOT` not set** | Needs to be configured so `collectstatic` has a target directory. |
| 3 | **Structured logging** | No `LOGGING` dict configured. Add JSON-formatted logging for production observability. |
| 4 | **Custom exception handler** | No `EXCEPTION_HANDLER` set in `REST_FRAMEWORK`. API errors currently return Django's default format. |
| 5 | **Rate limiting** | No `DEFAULT_THROTTLE_CLASSES` or `DEFAULT_THROTTLE_RATES` configured. Token and login endpoints are unprotected against brute-force. |

---

## Verification

Run these checks to confirm the security configuration is active:

```bash
# 1. SECRET_KEY — must fail without env var in production mode
DJANGO_DEBUG=False python manage.py check
# Expected: ValueError if DJANGO_SECRET_KEY is not set

# 2. DEBUG — confirm default is False
python -c "from config.settings import DEBUG; print('DEBUG =', DEBUG)"
# Expected: DEBUG = False

# 3. ALLOWED_HOSTS — confirm no wildcard
python -c "from config.settings import ALLOWED_HOSTS; print(ALLOWED_HOSTS)"
# Expected: ['localhost', '127.0.0.1']

# 4. Password validators — try a weak password
echo "from django.contrib.auth.password_validation import validate_password; validate_password('short')" \
  | python manage.py shell
# Expected: ValidationError

# 5. REST Framework defaults — confirm auth is required
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/
# Expected: 401 or 403

# 6. CORS — confirm origin restriction
curl -s -H "Origin: http://evil.com" -I http://localhost:8000/api/ \
  | grep -i access-control
# Expected: No Access-Control-Allow-Origin header

# 7. Token endpoint — confirm exists
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/auth/token/
# Expected: 400 (missing credentials), not 404

# 8. Security headers — confirm present
curl -s -I http://localhost:8000/ | grep -iE "x-xss|content-security"
# Expected: X-XSS-Protection and Content-Security-Policy headers
```
