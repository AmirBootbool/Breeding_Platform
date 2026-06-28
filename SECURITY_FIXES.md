# Security Checklist & Quick Fix Guide

## CRITICAL: Fix These Immediately

### 1. ALLOWED_HOSTS Configuration
**File:** `backend/config/settings.py` (Line 8)

**Current (INSECURE):**
```python
ALLOWED_HOSTS = ['*']
```

**Fixed:**
```python
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')
```

**Update `.env`:**
```
ALLOWED_HOSTS=localhost,127.0.0.1,yourdomain.com,www.yourdomain.com
```

---

### 2. DEBUG Mode Configuration
**File:** `backend/config/settings.py` (Line 7)

**Current (UNSAFE):**
```python
DEBUG = config('DJANGO_DEBUG', default=True, cast=bool)
```

**Fixed:**
```python
DEBUG = config('DJANGO_DEBUG', default=False, cast=bool)
```

**Update `.env`:**
```
DJANGO_DEBUG=False  # Only True for local development
```

---

### 3. SECRET_KEY Management
**File:** `backend/config/settings.py` (Line 6)

**Current (VULNERABLE):**
```python
SECRET_KEY = config('DJANGO_SECRET_KEY', default='change-me-to-a-long-random-string')
```

**Fixed:**
```python
SECRET_KEY = config('DJANGO_SECRET_KEY')  # Remove default, require environment variable
```

**Generate Secure Key:**
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

**Add to `.env`:**
```
DJANGO_SECRET_KEY=[paste-generated-key-here]
```

**Update `.env.example`:**
```
# Generate with: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
DJANGO_SECRET_KEY=change-me-to-a-long-random-string
```

---

### 4. Password Validators
**File:** `backend/config/settings.py` (Line 66)

**Current (NO VALIDATION):**
```python
AUTH_PASSWORD_VALIDATORS = []
```

**Fixed:**
```python
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
```

---

### 5. REST Framework Configuration
**File:** `backend/config/settings.py` (Add after STATIC_URL)

**Add to settings.py:**
```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle'
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour'
    },
}
```

---

### 6. CORS Configuration
**File:** `backend/config/settings.py`

**Install package:**
```bash
pip install django-cors-headers
```

**Add to INSTALLED_APPS:**
```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',  # ADD THIS
    'rest_framework',
    'apps.core',
    'apps.germplasm',
    'apps.trials',
]
```

**Add CORS configuration to settings.py:**
```python
# CORS Configuration
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://localhost:8000'
).split(',')

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]
```

**Update `.env`:**
```
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000,https://yourdomain.com
```

---

### 7. Token Authentication
**File:** `backend/config/settings.py`

**Add to INSTALLED_APPS:**
```python
INSTALLED_APPS = [
    # ... existing
    'rest_framework',
    'rest_framework.authtoken',  # ADD THIS
    # ...
]
```

**Run migrations:**
```bash
python manage.py migrate
```

**Generate token for user:**
```bash
python manage.py drf_create_token username
```

Or programmatically:
```python
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User

user = User.objects.get(username='username')
token, created = Token.objects.get_or_create(user=user)
print(f"Token: {token.key}")
```

---

### 8. Static Files Configuration
**File:** `backend/config/settings.py`

**Current:**
```python
STATIC_URL = "/static/"
```

**Add:**
```python
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []

# Use WhiteNoise for production
MIDDLEWARE = [
    "whitenoise.middleware.WhiteNoiseMiddleware",  # Add FIRST
    "django.middleware.security.SecurityMiddleware",
    # ... rest of middleware
]

# WhiteNoise configuration
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
```

**Install package:**
```bash
pip install whitenoise
```

---

## Verification Checklist

- [ ] ALLOWED_HOSTS restricted to specific domains
- [ ] DEBUG set to False in production
- [ ] SECRET_KEY is random and not the default
- [ ] Password validators enabled
- [ ] REST_FRAMEWORK configured with authentication
- [ ] CORS properly configured
- [ ] Token authentication enabled
- [ ] Static files configured for production
- [ ] Environment variables documented in `.env.example`
- [ ] Database is PostgreSQL in production (not SQLite)
- [ ] HTTPS enforced in production
- [ ] Logging configured
- [ ] Error handling middleware in place

---

## Testing Security Configuration

**Test that DEBUG is False:**
```bash
python manage.py shell
>>> from django.conf import settings
>>> print(f"DEBUG: {settings.DEBUG}")
False
```

**Test that SECRET_KEY is set:**
```bash
python manage.py check
System check identified no issues (0 silenced).
```

**Test ALLOWED_HOSTS:**
```python
from django.conf import settings
print(settings.ALLOWED_HOSTS)
```

**Test authentication works:**
```bash
# Generate token
python manage.py drf_create_token testuser

# Try API without token (should fail)
curl http://localhost:8000/api/v1/programs/

# Try with token (should work)
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8000/api/v1/programs/
```

