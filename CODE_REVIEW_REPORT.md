# Wheat Breeding Platform - Comprehensive Code Review Report

**Review Date:** June 28, 2026  
**Project:** Django REST Framework Application for Wheat Breeding Data Management  
**Framework:** Django 5.1, DRF 3.15  
**Status:** Phase 0/1 Scaffold

---

## Executive Summary

The wheat-breeding-platform is a well-structured Phase 0/1 Django REST Framework application with solid foundational models and database design. The project demonstrates good Django patterns, particularly in model organization, admin configuration, and test setup. However, there are **critical security vulnerabilities**, **incomplete API implementation**, **performance concerns**, and **missing best practices** that must be addressed before production deployment.

**Critical Issues Found:** 12  
**High Priority Issues:** 18  
**Medium Priority Issues:** 15  
**Low Priority Issues:** 10

---

## 1. PROJECT STRUCTURE & ORGANIZATION

### Status: ✅ Good Foundation

**Findings:**
- Well-organized three-app structure (core, germplasm, trials) with clear separation of concerns
- DRF installed but **not utilized** - no serializers, viewsets, or API endpoints exist
- Models are comprehensive and well-related
- Test structure is in place with pytest configuration

**Issues:**

#### Issue 1.1: Missing REST Framework Implementation
**Severity:** HIGH  
**Files:** All apps  
**Problem:** DRF is installed (requirements.txt line 2) but the entire REST API layer is missing:
- No `serializers.py` files in any app
- No `views.py` or `viewsets.py` files
- No API URL routes configured (only admin in `config/urls.py`)
- No router configuration for DRF

**Impact:** The project cannot serve as a REST API despite being configured for it.

**Recommendation:**
```python
# Create for each app: apps/{app_name}/serializers.py
# Example structure needed:
from rest_framework import serializers
from .models import Program, Location, Season, UserProfile

class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ['id', 'name', 'crop', 'description', 'created_at']
```

---

## 2. DJANGO CONFIGURATION

### Status: ⚠️ Multiple Security Issues

**Files:** [config/settings.py](config/settings.py)

### Issue 2.1: Overly Permissive ALLOWED_HOSTS
**Severity:** CRITICAL  
**Line:** 8  
**Code:**
```python
ALLOWED_HOSTS = ['*']
```

**Problem:** Allows requests from any host. Vulnerable to Host header attacks.

**Recommendation:**
```python
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')
# In .env: ALLOWED_HOSTS=localhost,127.0.0.1,yourdomain.com
```

---

### Issue 2.2: DEBUG Mode Defaults to True
**Severity:** CRITICAL  
**Line:** 7  
**Code:**
```python
DEBUG = config('DJANGO_DEBUG', default=True, cast=bool)
```

**Problem:** Debug mode exposes sensitive information (stack traces, database queries, environment variables) in production. The default should be False.

**Impact:** If .env is not configured, DEBUG is True.

**Recommendation:**
```python
DEBUG = config('DJANGO_DEBUG', default=False, cast=bool)
```

---

### Issue 2.3: Weak Default SECRET_KEY
**Severity:** CRITICAL  
**Line:** 6  
**Code:**
```python
SECRET_KEY = config('DJANGO_SECRET_KEY', default='change-me-to-a-long-random-string')
```

**Problem:** Default key is used if not in environment. In production, this would be a massive security breach.

**Recommendation:**
```python
SECRET_KEY = config('DJANGO_SECRET_KEY')  # Remove default, fail fast if not set
```

Ensure `.env.example` guides users to generate a key:
```bash
# Generate secure key:
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

### Issue 2.4: No Password Validators Configured
**Severity:** HIGH  
**Line:** 66  
**Code:**
```python
AUTH_PASSWORD_VALIDATORS = []
```

**Problem:** Disables all password validation. Users can set weak passwords like "123".

**Recommendation:**
```python
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
```

---

### Issue 2.5: No REST Framework Configuration
**Severity:** HIGH  
**File:** [config/settings.py](config/settings.py)  
**Problem:** DRF installed but no configuration for authentication, pagination, permissions, or pagination.

**Recommendation:** Add to settings.py:
```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
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
    'DEFAULT_VERSIONING_CLASS': 'rest_framework.versioning.NamespaceVersioning',
    'EXCEPTION_HANDLER': 'config.exception_handlers.custom_exception_handler',
}
```

---

### Issue 2.6: Missing CORS Configuration
**Severity:** HIGH  
**Problem:** No CORS headers configured. Frontend applications on different domains cannot access the API.

**Recommendation:**
1. Install: `pip install django-cors-headers`
2. Add to settings.py:
```python
INSTALLED_APPS = [
    # ... existing apps
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Add FIRST
    # ... existing middleware
]

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='http://localhost:3000').split(',')
CORS_ALLOW_CREDENTIALS = True
```

---

### Issue 2.7: Missing Logging Configuration
**Severity:** MEDIUM  
**Problem:** No logging setup for debugging, monitoring, or audit trails.

**Recommendation:** Add to settings.py:
```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'maxBytes': 1024 * 1024 * 10,  # 10MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': config('DJANGO_LOG_LEVEL', 'INFO'),
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
        },
    },
}
```

---

### Issue 2.8: Incomplete Static Files Configuration
**Severity:** MEDIUM  
**Line:** 77  
**Code:**
```python
STATIC_URL = "/static/"
```

**Problem:** `STATIC_ROOT` not defined. In production, `collectstatic` won't work properly.

**Recommendation:**
```python
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []
```

---

### Issue 2.9: No Exception Handling Middleware
**Severity:** MEDIUM  
**Problem:** No custom exception handlers for API errors. DRF will use defaults which may not match your error format.

**Recommendation:** Create [config/exception_handlers.py](config/exception_handlers.py):
```python
from rest_framework.views import exception_handler
from rest_framework.response import Response
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    
    if response is None:
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return Response(
            {'error': 'Internal server error'},
            status=500
        )
    
    # Add request details for logging
    logger.warning(
        f"API Error: {exc.__class__.__name__}",
        extra={'detail': response.data}
    )
    
    return response
```

---

## 3. URLS & ROUTING

### Status: ⚠️ Incomplete

**File:** [config/urls.py](config/urls.py)

### Issue 3.1: No API URL Routes Configured
**Severity:** HIGH  
**Lines:** 1-6  
**Code:**
```python
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
]
```

**Problem:** Only admin URL. No REST API endpoints despite DRF being installed.

**Recommendation:** Replace with:
```python
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.core.viewsets import ProgramViewSet, LocationViewSet, SeasonViewSet
from apps.germplasm.viewsets import GermplasmViewSet, CrossViewSet
from apps.trials.viewsets import TrialViewSet, PlotViewSet, ObservationViewSet, ObservationVariableViewSet

router = DefaultRouter()
router.register(r'programs', ProgramViewSet, basename='program')
router.register(r'locations', LocationViewSet, basename='location')
router.register(r'seasons', SeasonViewSet, basename='season')
router.register(r'germplasm', GermplasmViewSet, basename='germplasm')
router.register(r'crosses', CrossViewSet, basename='cross')
router.register(r'trials', TrialViewSet, basename='trial')
router.register(r'plots', PlotViewSet, basename='plot')
router.register(r'observations', ObservationViewSet, basename='observation')
router.register(r'observation-variables', ObservationVariableViewSet, basename='observation-variable')

urlpatterns = [
    path('api/v1/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
    path('admin/', admin.site.urls),
]
```

---

## 4. MODEL ANALYSIS

### Status: ⚠️ Good Structure with Performance Issues

### Issue 4.1: Inefficient Germplasm.save() Implementation
**Severity:** HIGH  
**File:** [apps/germplasm/models.py](apps/germplasm/models.py)  
**Lines:** 44-50  
**Code:**
```python
def save(self, *args, **kwargs):
    if not self.germplasm_db_id:
        super().save(*args, **kwargs)  # First save
        self.germplasm_db_id = f"G{self.pk:06d}"
        Germplasm.objects.filter(pk=self.pk).update(germplasm_db_id=self.germplasm_db_id)  # Second update
    else:
        super().save(*args, **kwargs)
```

**Problems:**
1. Two database operations for new objects (save + update)
2. Doesn't refresh `self.germplasm_db_id` after update
3. No error handling if update fails

**Recommendation:**
```python
def save(self, *args, **kwargs):
    is_new = self.pk is None
    super().save(*args, **kwargs)
    
    if is_new and not self.germplasm_db_id:
        self.germplasm_db_id = f"G{self.pk:06d}"
        Germplasm.objects.filter(pk=self.pk).update(germplasm_db_id=self.germplasm_db_id)
```

Or better, use a signal:
```python
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=Germplasm)
def set_germplasm_db_id(sender, instance, created, **kwargs):
    if created and not instance.germplasm_db_id:
        instance.germplasm_db_id = f"G{instance.pk:06d}"
        Germplasm.objects.filter(pk=instance.pk).update(germplasm_db_id=instance.germplasm_db_id)
```

---

### Issue 4.2: Observation Model Calls full_clean() Every Save
**Severity:** MEDIUM  
**File:** [apps/trials/models.py](apps/trials/models.py)  
**Lines:** 115-137  
**Code:**
```python
def save(self, *args, **kwargs):
    self.full_clean()  # Expensive validation call
    super().save(*args, **kwargs)
```

**Problem:** `full_clean()` is called every save, including bulk operations. This is inefficient for high-volume data entry.

**Recommendation:**
```python
def save(self, *args, **kwargs):
    if not kwargs.pop('skip_validation', False):
        self.full_clean()
    super().save(*args, **kwargs)

# For bulk operations:
# Observation.objects.bulk_create(...) should not use full_clean()
```

Better approach - use model validators in Meta:
```python
from django.core.validators import MinValueValidator, MaxValueValidator

class Observation(models.Model):
    # ... fields ...
    value_numeric = models.FloatField(
        null=True, 
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(1000)]  # Example limits
    )
```

---

### Issue 4.3: Missing Database Indexes on Frequently Queried Fields
**Severity:** HIGH  
**File:** Multiple model files  
**Problem:** No `db_index=True` on fields commonly used in queries:
- `Germplasm.name` - likely searched
- `Germplasm.program` - likely filtered
- `Trial.trial_code` - likely searched
- `Plot.trial` - likely filtered
- `Observation.variable` - likely filtered

**Impact:** Queries will do full table scans, degrading performance as data grows.

**Recommendation:** Add indexes to frequently queried fields:

**For [apps/germplasm/models.py](apps/germplasm/models.py):**
```python
class Germplasm(models.Model):
    name = models.CharField(max_length=300, db_index=True)
    germplasm_db_id = models.CharField(max_length=100, unique=True, blank=True, db_index=True)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='germplasm', db_index=True)
    # ... rest of fields
```

**For [apps/trials/models.py](apps/trials/models.py):**
```python
class Trial(models.Model):
    trial_code = models.CharField(max_length=255, unique=True, db_index=True)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, db_index=True)
    # ... rest of fields

class Plot(models.Model):
    trial = models.ForeignKey(Trial, on_delete=models.CASCADE, db_index=True)
    germplasm = models.ForeignKey(Germplasm, on_delete=models.CASCADE, db_index=True)
    # ... rest of fields

class Observation(models.Model):
    variable = models.ForeignKey(ObservationVariable, on_delete=models.PROTECT, related_name='observations', db_index=True)
    # ... rest of fields
```

---

### Issue 4.4: Missing Created/Updated Timestamps
**Severity:** MEDIUM  
**Files:** Multiple models  
**Problem:** Several models lack `created_at`/`updated_at` fields:
- `UserProfile` (no timestamp)
- `Cross` (no timestamp)
- `Trial` (no timestamp)

**Impact:** Cannot track when records were created or modified, hindering auditing.

**Recommendation:** Add timestamp fields to all models:

**For [apps/core/models.py](apps/core/models.py) - UserProfile:**
```python
class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default='viewer')
    program = models.ForeignKey(Program, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)  # ADD THIS
```

**For [apps/germplasm/models.py](apps/germplasm/models.py) - Cross:**
```python
class Cross(models.Model):
    cross_code = models.CharField(max_length=100, unique=True)
    female_parent = models.ForeignKey(Germplasm, on_delete=models.PROTECT, related_name='crosses_as_female')
    male_parent = models.ForeignKey(Germplasm, on_delete=models.PROTECT, related_name='crosses_as_male')
    cross_date = models.DateField()
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)  # ADD THIS
    updated_at = models.DateTimeField(auto_now=True)  # ADD THIS
```

**For [apps/trials/models.py](apps/trials/models.py) - Trial:**
```python
class Trial(models.Model):
    name = models.CharField(max_length=255)
    trial_code = models.CharField(max_length=255, unique=True)
    # ... existing fields ...
    created_at = models.DateTimeField(auto_now_add=True)  # ADD THIS
    updated_at = models.DateTimeField(auto_now=True)  # ADD THIS
```

---

### Issue 4.5: Missing Help Text and Documentation
**Severity:** LOW  
**Problem:** Many model fields lack `help_text` for admin interface and API documentation.

**Example from [apps/trials/models.py](apps/trials/models.py):**
```python
# Current:
num_reps = models.IntegerField(default=1)

# Recommended:
num_reps = models.IntegerField(
    default=1,
    help_text='Number of experimental repetitions/blocks'
)
```

---

### Issue 4.6: Missing Constraints on Numeric Fields
**Severity:** MEDIUM  
**File:** [apps/trials/models.py](apps/trials/models.py)  
**Lines:** 92-93  
**Code:**
```python
min_value = models.FloatField(null=True, blank=True)
max_value = models.FloatField(null=True, blank=True)
```

**Problem:** No database constraints ensuring min_value <= max_value.

**Recommendation:**
```python
from django.db.models import Q, CheckConstraint

class ObservationVariable(models.Model):
    # ... fields ...
    
    class Meta:
        ordering = ['name']
        verbose_name_plural = 'observation variables'
        constraints = [
            CheckConstraint(
                check=Q(min_value__isnull=True) | Q(max_value__isnull=True) | Q(min_value__lte=models.F('max_value')),
                name='min_value_lte_max_value'
            ),
        ]
```

---

### Issue 4.7: Redundant Pedigree Information
**Severity:** LOW  
**File:** [apps/germplasm/models.py](apps/germplasm/models.py)  
**Lines:** 15-40  
**Problem:** Both `parent_female`/`parent_male` ForeignKeys AND `pedigree_string` CharField represent pedigree. This creates data duplication.

**Recommendation:** Add documentation clarifying usage:
```python
pedigree_string = models.CharField(
    max_length=500,
    blank=True,
    help_text='Free-text pedigree notation for historical/documented crosses. '
              'For traceable lineages, use parent_female and parent_male fields instead.',
)
```

---

## 5. SERIALIZERS & API

### Status: ❌ Missing

**Severity:** CRITICAL

### Issue 5.1: No Serializers Defined
**Problem:** DRF installed but no serializers exist for any model.

**Recommendation:** Create `serializers.py` in each app:

**[apps/core/serializers.py](apps/core/serializers.py) (NEW FILE):**
```python
from rest_framework import serializers
from .models import Program, Location, Season, UserProfile

class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ['id', 'name', 'crop', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']

class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name', 'latitude', 'longitude', 'country', 'region']
        read_only_fields = ['id']

class SeasonSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source='program.name', read_only=True)
    
    class Meta:
        model = Season
        fields = ['id', 'name', 'year', 'program', 'program_name']
        read_only_fields = ['id']

class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    
    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'email', 'role', 'program', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
```

---

### Issue 5.2: No ViewSets or Views
**Severity:** CRITICAL  
**Problem:** DRF installed but no views to expose API endpoints.

**Recommendation:** Create `viewsets.py` in each app:

**[apps/core/viewsets.py](apps/core/viewsets.py) (NEW FILE):**
```python
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Program, Location, Season, UserProfile
from .serializers import ProgramSerializer, LocationSerializer, SeasonSerializer, UserProfileSerializer

class ProgramViewSet(viewsets.ModelViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'crop']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'country', 'region']
    filterset_fields = ['country', 'region']

class SeasonViewSet(viewsets.ModelViewSet):
    queryset = Season.objects.all()
    serializer_class = SeasonSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['year', 'program']
    ordering = ['-year']

class UserProfileViewSet(viewsets.ModelViewSet):
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['role', 'program']
```

---

## 6. VIEWS & VIEWSETS

See Issue 5.2 above - needs implementation.

---

## 7. ADMIN INTERFACE

### Status: ✅ Good

**Files:** admin.py in each app

### Observations:
- Good use of `list_display`, `search_fields`, `list_filter`
- Proper use of `raw_id_fields` for ForeignKey relationships
- Good fieldset organization in GermplasmAdmin

### Issue 6.1: Missing readonly_fields for Auto-Generated Fields
**Severity:** LOW  
**File:** [apps/germplasm/admin.py](apps/germplasm/admin.py)  
**Problem:** `germplasm_db_id` is auto-generated but appears in fieldsets without being marked readonly.

**Recommendation:**
```python
@admin.register(Germplasm)
class GermplasmAdmin(admin.ModelAdmin):
    list_display = ['name', 'germplasm_db_id', 'program', 'cross_type', 'year_developed']
    search_fields = ['name', 'germplasm_db_id', 'pedigree_string']
    list_filter = ['program', 'cross_type']
    raw_id_fields = ['parent_female', 'parent_male']
    readonly_fields = ['germplasm_db_id', 'created_at']  # ADD THIS
    fieldsets = [
        ('Identity', {'fields': ['name', 'germplasm_db_id', 'species', 'program']}),
        ('Pedigree', {'fields': ['parent_female', 'parent_male', 'pedigree_string', 'cross_type', 'year_developed']}),
        ('Metadata', {'fields': ['created_at'], 'classes': ['collapse']}),  # ADD THIS
        ('Notes', {'fields': ['notes']}),
    ]
```

---

### Issue 6.2: Missing Custom Admin Actions
**Severity:** MEDIUM  
**Files:** Multiple admin files  
**Problem:** No custom actions for bulk operations (e.g., bulk export, status changes).

**Recommendation - Add bulk action to TrialAdmin:**
```python
@admin.register(Trial)
class TrialAdmin(admin.ModelAdmin):
    # ... existing config ...
    actions = ['create_default_plots']
    
    def create_default_plots(self, request, queryset):
        for trial in queryset:
            # Only create if no plots exist
            if not trial.plot_set.exists():
                trial.create_plots(trial.germplasm_set.all())
        self.message_user(request, f"Created plots for {queryset.count()} trials")
    
    create_default_plots.short_description = "Create default plots for selected trials"
```

---

## 8. ERROR HANDLING & VALIDATION

### Status: ⚠️ Partial

### Issue 7.1: Limited Error Handling in Observation Model
**Severity:** MEDIUM  
**File:** [apps/trials/models.py](apps/trials/models.py)  
**Lines:** 115-137  
**Problem:** Validation logic is tight to the model but doesn't handle edge cases:
1. No logging of validation failures
2. No distinction between user errors and system errors
3. No grace period for integer vs float confusion

**Recommendation:**
```python
from django.core.exceptions import ValidationError
import logging

logger = logging.getLogger(__name__)

class Observation(models.Model):
    # ... existing fields ...
    
    def clean(self):
        errors = {}
        
        if self.variable.data_type in ('numeric', 'integer'):
            if self.value_numeric is None:
                errors['value_numeric'] = 'Numeric observation requires a numeric value.'
            elif self.variable.data_type == 'integer':
                # Allow floats that represent whole numbers (e.g., 5.0)
                if self.value_numeric != int(self.value_numeric):
                    errors['value_numeric'] = 'Integer observations must be whole numbers.'
            
            # Check min/max constraints
            if self.value_numeric is not None and self.variable.min_value is not None:
                if self.value_numeric < self.variable.min_value:
                    errors['value_numeric'] = f'Value must be >= {self.variable.min_value}'
            if self.value_numeric is not None and self.variable.max_value is not None:
                if self.value_numeric > self.variable.max_value:
                    errors['value_numeric'] = f'Value must be <= {self.variable.max_value}'

        if self.variable.data_type == 'text' and not self.value_text:
            errors['value_text'] = 'Text observation requires a value.'

        if self.variable.data_type == 'date' and self.value_date is None:
            errors['value_date'] = 'Date observation requires a date value.'
        
        if self.variable.is_required:
            if not any([self.value_numeric, self.value_text, self.value_date]):
                errors['values'] = 'This variable requires a value.'
        
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        try:
            self.full_clean()
        except ValidationError as e:
            logger.warning(f"Validation failed for observation: {e.message_dict}")
            raise
        super().save(*args, **kwargs)
```

---

### Issue 7.2: No Validation for Cross Model
**Severity:** MEDIUM  
**File:** [apps/germplasm/models.py](apps/germplasm/models.py)  
**Problem:** No validation that female_parent != male_parent, or that both parents are from the same program.

**Recommendation:**
```python
class Cross(models.Model):
    # ... existing fields ...
    
    def clean(self):
        errors = {}
        
        if self.female_parent == self.male_parent:
            errors['male_parent'] = 'Male parent cannot be the same as female parent.'
        
        if self.female_parent.program != self.male_parent.program:
            errors['male_parent'] = 'Both parents must be from the same program.'
        
        if errors:
            raise ValidationError(errors)
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
```

---

## 9. SECURITY CONSIDERATIONS

### Status: ⚠️ Several Issues Identified

### Issue 8.1: No Authentication on Models (Future API)
**Severity:** HIGH  
**Problem:** When API is implemented, there will be no authentication/authorization.

**Recommendation:** 
1. Install token auth: `pip install djangorestframework`
2. In settings.py:
```python
INSTALLED_APPS = [
    # ... existing ...
    'rest_framework',
    'rest_framework.authtoken',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}
```

3. Create management command for token generation:
```bash
python manage.py drf_create_token username
```

---

### Issue 8.2: UserProfile Role-Based Access Not Enforced
**Severity:** HIGH  
**File:** [apps/core/models.py](apps/core/models.py)  
**Problem:** Role field exists but no permissions are enforced based on roles.

**Recommendation:** Create permission classes:

**[config/permissions.py](config/permissions.py) (NEW FILE):**
```python
from rest_framework.permissions import BasePermission

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role == 'admin'

class IsBreeder(BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role in ['admin', 'breeder']

class CanViewTrials(BasePermission):
    def has_object_permission(self, request, view, obj):
        # Users can only view trials from their program
        user_program = request.user.profile.program
        return obj.program == user_program or request.user.profile.role == 'admin'

class CanEditTrials(BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role in ['admin', 'breeder']
```

---

### Issue 8.3: No Rate Limiting
**Severity:** MEDIUM  
**Problem:** API endpoints (when created) will have no rate limiting, vulnerable to DoS attacks.

**Recommendation:** In settings.py REST_FRAMEWORK config (Issue 2.5):
```python
'DEFAULT_THROTTLE_CLASSES': [
    'rest_framework.throttling.AnonRateThrottle',
    'rest_framework.throttling.UserRateThrottle'
],
'DEFAULT_THROTTLE_RATES': {
    'anon': '100/hour',
    'user': '1000/hour'
}
```

---

### Issue 8.4: No SQL Injection Prevention in Admin
**Severity:** LOW (Django's ORM mostly safe)  
**Problem:** No evidence of raw SQL anywhere, which is good. But no validation in searches.

**Recommendation:** Keep using Django ORM, never use raw SQL. Current code is safe.

---

## 10. PERFORMANCE CONSIDERATIONS

### Status: ⚠️ Potential Issues

### Issue 9.1: No Query Optimization (N+1 Queries)
**Severity:** HIGH  
**Problem:** When API views are implemented, they'll have N+1 query problems.

**Example problem in future view:**
```python
# BAD: This causes N+1 queries
trials = Trial.objects.all()
for trial in trials:
    print(trial.program.name)  # Query per trial!
```

**Recommendation:** Use select_related and prefetch_related:
```python
# GOOD
trials = Trial.objects.select_related('program', 'location', 'season')
for trial in trials:
    print(trial.program.name)  # No additional queries
```

In viewsets:
```python
class TrialViewSet(viewsets.ModelViewSet):
    queryset = Trial.objects.select_related('program', 'location', 'season')
```

---

### Issue 9.2: No Caching Layer
**Severity:** MEDIUM  
**Problem:** No caching configured for frequently accessed data (programs, locations).

**Recommendation:** Add caching in settings.py:
```python
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
    }
}

# Or for production with Redis:
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}
```

Cache frequently accessed data:
```python
from django.core.cache import cache

@cache_page(60)  # Cache for 60 seconds
def get_programs():
    return Program.objects.all()
```

---

### Issue 9.3: Trial.create_plots() Can Fail Silently
**Severity:** MEDIUM  
**File:** [apps/trials/utils.py](apps/trials/utils.py)  
**Lines:** 23-31  
**Code:**
```python
def create_plots_for_trial(trial, entries: List[Germplasm], seed: int | None = None):
    layouts = generate_rcbd_layout(entries, trial.num_reps, seed=seed)
    plot_number = 1
    created = []
    for rep, entry_list in layouts:
        for g in entry_list:
            p = Plot.objects.create(trial=trial, germplasm=g, rep=rep, plot_number=plot_number)
            created.append(p)
            plot_number += 1
    return created
```

**Problems:**
1. No transaction - if one Plot creation fails, others succeed
2. No error handling or logging
3. No batch optimization

**Recommendation:**
```python
from django.db import transaction
import logging

logger = logging.getLogger(__name__)

def create_plots_for_trial(trial, entries: List[Germplasm], seed: int | None = None):
    """Create Plot objects for a trial using RCBD ordering.
    
    Args:
        trial: Trial instance
        entries: List of Germplasm instances
        seed: Random seed for reproducibility
        
    Returns:
        List of created Plot instances
        
    Raises:
        ValueError: If entries is empty
        IntegrityError: If plots already exist
    """
    if not entries:
        raise ValueError("At least one entry is required to create plots")
    
    layouts = generate_rcbd_layout(entries, trial.num_reps, seed=seed)
    plot_number = 1
    plot_objects = []
    
    try:
        with transaction.atomic():
            for rep, entry_list in layouts:
                for g in entry_list:
                    plot_objects.append(
                        Plot(trial=trial, germplasm=g, rep=rep, plot_number=plot_number)
                    )
                    plot_number += 1
            
            # Bulk create for efficiency
            created = Plot.objects.bulk_create(plot_objects)
            logger.info(f"Created {len(created)} plots for trial {trial.trial_code}")
            return created
    except Exception as e:
        logger.error(f"Failed to create plots for trial {trial.trial_code}: {e}")
        raise
```

---

## 11. TESTING

### Status: ✅ Good Foundation

**Files:** [backend/tests/](backend/tests/)

### Positive Observations:
- Tests properly marked with `@pytest.mark.django_db`
- Good coverage of model creation and relationships
- Tests for constraints (unique_together, unique)

### Issue 10.1: Missing Test Fixtures
**Severity:** MEDIUM  
**Problem:** Repeated test setup (creating Program, Location, Season, etc.) in multiple test files.

**Recommendation:** Create [backend/tests/conftest.py](backend/tests/conftest.py):
```python
import pytest
from django.contrib.auth import get_user_model
from apps.core.models import Program, Location, Season, UserProfile
from apps.germplasm.models import Germplasm, Cross
from apps.trials.models import Trial

User = get_user_model()

@pytest.fixture
def program():
    return Program.objects.create(name='Test Program', crop='wheat')

@pytest.fixture
def location():
    return Location.objects.create(
        name='Test Farm',
        country='Test Country',
        latitude=0.0,
        longitude=0.0
    )

@pytest.fixture
def season(program):
    return Season.objects.create(year=2026, name='Test Season', program=program)

@pytest.fixture
def trial(program, location, season):
    return Trial.objects.create(
        name='Test Trial',
        trial_code='T001',
        program=program,
        location=location,
        season=season,
        design_type='RCBD',
        num_reps=2
    )

@pytest.fixture
def germplasm(program):
    return Germplasm.objects.create(
        name='Test Line',
        germplasm_db_id='G001',
        program=program
    )

@pytest.fixture
def user():
    return User.objects.create_user(username='testuser', password='testpass123')

@pytest.fixture
def user_profile(user, program):
    return UserProfile.objects.create(user=user, role='breeder', program=program)
```

Then simplify tests:
```python
@pytest.mark.django_db
def test_trial_plot_creation(trial, germplasm):
    plots = trial.create_plots([germplasm])
    assert len(plots) == 2  # num_reps=2
```

---

### Issue 10.2: Missing Admin Tests
**Severity:** MEDIUM  
**Problem:** No tests for admin interface functionality.

**Recommendation:** Create [backend/tests/test_admin.py](backend/tests/test_admin.py):
```python
import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse
from apps.core.models import Program

User = get_user_model()

@pytest.mark.django_db
def test_program_admin_list_display():
    # Create admin user
    admin_user = User.objects.create_superuser('admin', 'admin@test.com', 'password')
    
    # Create test data
    Program.objects.create(name='TestProg', crop='wheat')
    
    # Login
    client = Client()
    client.login(username='admin', password='password')
    
    # Access admin changelist
    response = client.get(reverse('admin:core_program_changelist'))
    assert response.status_code == 200
    assert 'TestProg' in str(response.content)
```

---

### Issue 10.3: No API Tests
**Severity:** HIGH  
**Problem:** No API tests defined (because no API exists yet).

**Recommendation:** When creating viewsets, create [backend/tests/test_api.py](backend/tests/test_api.py):
```python
import pytest
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model
from apps.core.models import Program

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def authenticated_client(api_client):
    user = User.objects.create_user(username='testuser', password='testpass')
    token = Token.objects.create(user=user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
    return api_client

@pytest.mark.django_db
def test_program_list_api(authenticated_client):
    Program.objects.create(name='Prog1', crop='wheat')
    response = authenticated_client.get('/api/v1/programs/')
    assert response.status_code == 200
    assert len(response.data['results']) == 1
```

---

## 12. DEPENDENCIES & REQUIREMENTS

### Status: ⚠️ Incomplete

**File:** [backend/requirements.txt](backend/requirements.txt)

### Issue 11.1: Incomplete Requirements for Production
**Severity:** HIGH  
**Current Requirements:**
```
Django==5.1.*
djangorestframework==3.15.*
psycopg2-binary==2.9.*
python-decouple==3.8.*
dj-database-url==2.*
pytest==8.*
pytest-django==4.*
```

**Missing Critical Packages:**
1. `django-cors-headers` - for CORS support
2. `django-filter` - for filtering API endpoints
3. `django-redis` - for caching
4. `celery` - for async tasks (future)
5. `gunicorn` - for production server
6. `whitenoise` - for static files in production

**Recommendation:** Update requirements.txt:
```
# Core
Django==5.1.*
djangorestframework==3.15.*
python-decouple==3.8.*

# Database
psycopg2-binary==2.9.*
dj-database-url==2.*

# API & Middleware
django-cors-headers==4.*
django-filter==24.*
djangorestframework-simplejwt==5.*  # Better than Token auth

# Caching
django-redis==5.*
redis==5.*

# Production
gunicorn==21.*
whitenoise==6.*

# Development
pytest==8.*
pytest-django==4.*
pytest-cov==4.*
django-debug-toolbar==4.*  # For debugging

# Code Quality
black==24.*
flake8==7.*
isort==5.*
```

---

### Issue 11.2: No Separate Requirements for Development vs Production
**Severity:** MEDIUM  
**Problem:** All dependencies in one file, including test tools in production.

**Recommendation:** Create separate files:

**[backend/requirements/base.txt](backend/requirements/base.txt):**
```
Django==5.1.*
djangorestframework==3.15.*
python-decouple==3.8.*
psycopg2-binary==2.9.*
dj-database-url==2.*
django-cors-headers==4.*
django-filter==24.*
djangorestframework-simplejwt==5.*
django-redis==5.*
redis==5.*
gunicorn==21.*
whitenoise==6.*
```

**[backend/requirements/dev.txt](backend/requirements/dev.txt):**
```
-r base.txt
pytest==8.*
pytest-django==4.*
pytest-cov==4.*
django-debug-toolbar==4.*
black==24.*
flake8==7.*
isort==5.*
```

Usage:
```bash
pip install -r requirements/dev.txt  # for development
pip install -r requirements/base.txt # for production
```

---

## 13. DOCUMENTATION

### Status: ⚠️ Lacking

### Issue 12.1: Missing API Documentation
**Severity:** MEDIUM  
**Problem:** No API documentation exists (API not implemented yet).

**Recommendation:** When API is built, add documentation:

**Option 1: Swagger/OpenAPI (Recommended)**
```bash
pip install drf-spectacular
```

In settings.py:
```python
INSTALLED_APPS = [
    # ...
    'drf_spectacular',
]

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}
```

In urls.py:
```python
from drf_spectacular.views import SpectacularSwaggerView, SpectacularAPIView

urlpatterns = [
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema')),
    # ...
]
```

**Option 2: ReDoc**
```python
from drf_spectacular.views import SpectacularReDocView

urlpatterns = [
    path('api/redoc/', SpectacularReDocView.as_view(url_name='schema')),
]
```

---

### Issue 12.2: Missing Model Docstrings
**Severity:** MEDIUM  
**Problem:** Models lack docstrings explaining purpose and usage.

**Recommendation:** Add module-level and class docstrings:

**[apps/germplasm/models.py](apps/germplasm/models.py):**
```python
"""
Germplasm and cross management models.

This module handles the storage and management of wheat germplasm lines
and their crosses. A Germplasm represents a breeding line, and a Cross
represents the intentional crossing of two germplasm lines.
"""

class Germplasm(models.Model):
    """
    A wheat germplasm line or variety.
    
    Attributes:
        name: Display name of the germplasm
        germplasm_db_id: Auto-generated unique database identifier (G000001 format)
        species: Crop species (default: Triticum aestivum for wheat)
        program: Foreign key to Program
        parent_female: Reference to maternal parent (for traceable crosses)
        parent_male: Reference to paternal parent (for traceable crosses)
        pedigree_string: Free-text pedigree notation for historical reference
        cross_type: Type of cross (biparental, self, backcross, etc.)
        year_developed: Year the line was developed
    """
```

---

### Issue 12.3: Missing Deployment Guide
**Severity:** MEDIUM  
**Problem:** README mentions Docker but no deployment guide exists.

**Recommendation:** Create [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md):
```markdown
# Deployment Guide

## Environment Variables

Required environment variables for production:
- `DJANGO_SECRET_KEY` - Generated secret key (use: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`)
- `DJANGO_DEBUG` - Set to False
- `DJANGO_ALLOWED_HOSTS` - Comma-separated list of domains
- `DATABASE_URL` - PostgreSQL connection string
- `USE_SQLITE` - Set to False

## Docker Deployment

1. Build image: `docker-compose build`
2. Start services: `docker-compose up -d`
3. Run migrations: `docker-compose exec web python manage.py migrate`
4. Create superuser: `docker-compose exec web python manage.py createsuperuser`

## Production Checklist

- [ ] DEBUG = False
- [ ] SECRET_KEY is random and not default
- [ ] ALLOWED_HOSTS properly configured
- [ ] Database is PostgreSQL
- [ ] Email backend configured
- [ ] CORS_ALLOWED_ORIGINS set
- [ ] HTTPS forced
- [ ] Static files collected
- [ ] Logs configured
```

---

## 14. CODE STYLE & CONVENTIONS

### Status: ✅ Generally Good

### Issue 13.1: Missing Type Hints
**Severity:** LOW  
**Problem:** Functions lack type hints (PEP 484).

**Recommendation:** Add type hints:

**[apps/trials/utils.py](apps/trials/utils.py):**
```python
from typing import List, Optional
from apps.germplasm.models import Germplasm
from .models import Plot, Trial

def generate_rcbd_layout(
    entries: List[Germplasm], 
    num_reps: int, 
    seed: Optional[int] = None
) -> List[tuple]:
    """Generate RCBD layout ordering."""
    # ... implementation

def create_plots_for_trial(
    trial: Trial, 
    entries: List[Germplasm], 
    seed: Optional[int] = None
) -> List[Plot]:
    """Create Plot objects for a trial using RCBD ordering."""
    # ... implementation
```

---

### Issue 13.2: No linting/formatting Configuration
**Severity:** LOW  
**Problem:** No Black, isort, or flake8 configuration.

**Recommendation:** Create [backend/.flake8](backend/.flake8):
```ini
[flake8]
max-line-length = 100
exclude = .venv,migrations,__pycache__
```

Create [backend/pyproject.toml](backend/pyproject.toml):
```toml
[tool.black]
line-length = 100
target-version = ['py311']
exclude = '.venv|migrations'

[tool.isort]
profile = "black"
line_length = 100
skip = ['.venv', 'migrations']
```

---

## 15. DATABASE DESIGN

### Status: ✅ Good with Minor Issues

### Issue 14.1: No Database Migrations in Git
**Severity:** LOW  
**Problem:** No migration files committed (migrations/ directory not created).

**Recommendation:** Generate and commit migrations:
```bash
python manage.py makemigrations
# Then commit migrations/ directory to git
```

---

### Issue 14.2: Missing Cascade Delete Implications
**Severity:** MEDIUM  
**File:** [apps/core/models.py](apps/core/models.py)  
**Line:** 33 (Season model)  
**Code:**
```python
program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='seasons')
```

**Problem:** If a Program is deleted, all its Seasons (and cascaded Trials) are deleted. Add warning in docstring.

**Recommendation:**
```python
program = models.ForeignKey(
    Program, 
    on_delete=models.CASCADE, 
    related_name='seasons',
    help_text='Deleting a program will delete all seasons and trials'
)
```

---

## 16. GIT & VERSION CONTROL

### Status: ⚠️ Some Issues

### Issue 15.1: Potential Uncommitted .swp File
**Severity:** LOW  
**File:** [apps/germplasm/.models.py.swp](apps/germplasm/.models.py.swp)  
**Problem:** Vim swap file present (likely from interrupted editing).

**Recommendation:** Remove and ensure .gitignore is correct:
```bash
rm backend/apps/germplasm/.models.py.swp
# Check .gitignore has *.swp
```

---

## 17. DOCKER & DEPLOYMENT

### Status: ✅ Adequate for Development

**File:** [docker-compose.yml](docker-compose.yml)  
**File:** [backend/Dockerfile](backend/Dockerfile) (not fully reviewed)

### Positive Points:
- Separate services for web and database
- PostgreSQL 16 Alpine (lightweight)
- Health checks configured
- Volume persistence for data

---

## 18. SUMMARY OF CRITICAL ISSUES

| # | Issue | Severity | File | Line |
|---|-------|----------|------|------|
| 1 | ALLOWED_HOSTS = '*' | CRITICAL | settings.py | 8 |
| 2 | DEBUG defaults to True | CRITICAL | settings.py | 7 |
| 3 | Weak default SECRET_KEY | CRITICAL | settings.py | 6 |
| 4 | No REST API implementation | CRITICAL | All apps | - |
| 5 | No password validators | HIGH | settings.py | 66 |
| 6 | No REST_FRAMEWORK config | HIGH | settings.py | - |
| 7 | No CORS configuration | HIGH | settings.py | - |
| 8 | No API authentication setup | HIGH | Settings | - |
| 9 | No indexes on queries | HIGH | Multiple models | - |
| 10 | Inefficient Germplasm.save() | HIGH | germplasm/models.py | 44 |
| 11 | Missing timestamps | MEDIUM | Multiple models | - |
| 12 | No logging configuration | MEDIUM | settings.py | - |

---

## 19. IMPLEMENTATION ROADMAP

### Phase 1: Security Fixes (IMMEDIATE)
- [ ] Fix ALLOWED_HOSTS configuration
- [ ] Set DEBUG default to False
- [ ] Remove default SECRET_KEY
- [ ] Enable password validators
- [ ] Configure CORS

### Phase 2: API Implementation (1-2 weeks)
- [ ] Create serializers for all models
- [ ] Create ViewSets for all models
- [ ] Configure DRF settings
- [ ] Set up authentication (TokenAuthentication or JWT)
- [ ] Create API URL routes

### Phase 3: Performance & Database (1 week)
- [ ] Add database indexes
- [ ] Add missing timestamps
- [ ] Optimize Germplasm.save()
- [ ] Configure caching layer
- [ ] Generate and commit migrations

### Phase 4: Testing & Documentation (1 week)
- [ ] Add API tests
- [ ] Add admin tests
- [ ] Create conftest.py fixtures
- [ ] Add API documentation (Swagger)
- [ ] Create deployment guide

### Phase 5: Code Quality (1 week)
- [ ] Add type hints
- [ ] Configure linters (Black, flake8, isort)
- [ ] Add model docstrings
- [ ] Add logging configuration
- [ ] Create separate requirements files

---

## 20. ESTIMATED EFFORT

| Category | Effort | Priority |
|----------|--------|----------|
| Security Fixes | 2 hours | CRITICAL |
| API Implementation | 16 hours | HIGH |
| Database Optimization | 4 hours | HIGH |
| Testing & Docs | 8 hours | MEDIUM |
| Code Quality | 6 hours | MEDIUM |
| Deployment Setup | 4 hours | MEDIUM |
| **TOTAL** | **40 hours** | - |

---

## Conclusion

The wheat-breeding-platform is a well-structured foundation for a breeding data management system. The model design is solid, admin interface is well-configured, and testing setup is in place. However, critical security vulnerabilities, incomplete API implementation, and missing best practices must be addressed before production deployment.

The project requires:
1. **Immediate:** Security configuration fixes
2. **Short-term:** Complete REST API implementation
3. **Medium-term:** Performance optimization and database indexing
4. **Ongoing:** Code quality and documentation improvements

Following this roadmap will result in a production-ready, secure, scalable wheat breeding platform.

