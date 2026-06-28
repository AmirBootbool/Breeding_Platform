# API Implementation Guide

Complete implementation templates for REST API endpoints.

## Installation Requirements

```bash
pip install django-filter
```

Add to `backend/config/settings.py` INSTALLED_APPS:
```python
'django_filters',
```

---

## 1. CORE APP API

### Create: `backend/apps/core/serializers.py`

```python
"""Serializers for core app models."""

from rest_framework import serializers
from .models import Program, Location, Season, UserProfile


class ProgramSerializer(serializers.ModelSerializer):
    """Serializer for Program model."""
    
    class Meta:
        model = Program
        fields = ['id', 'name', 'crop', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class LocationSerializer(serializers.ModelSerializer):
    """Serializer for Location model."""
    
    class Meta:
        model = Location
        fields = ['id', 'name', 'latitude', 'longitude', 'country', 'region']
        read_only_fields = ['id']


class SeasonSerializer(serializers.ModelSerializer):
    """Serializer for Season model."""
    
    program_name = serializers.CharField(source='program.name', read_only=True)
    
    class Meta:
        model = Season
        fields = ['id', 'name', 'year', 'program', 'program_name']
        read_only_fields = ['id']


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for UserProfile model."""
    
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    
    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'email', 'role', 'program', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
```

### Create: `backend/apps/core/viewsets.py`

```python
"""ViewSets for core app models."""

from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Program, Location, Season, UserProfile
from .serializers import (
    ProgramSerializer,
    LocationSerializer,
    SeasonSerializer,
    UserProfileSerializer,
)


class ProgramViewSet(viewsets.ModelViewSet):
    """ViewSet for Program model.
    
    List, create, retrieve, update, and delete programs.
    """
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'crop']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


class LocationViewSet(viewsets.ModelViewSet):
    """ViewSet for Location model.
    
    List, create, retrieve, update, and delete locations.
    """
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'country', 'region']
    filterset_fields = ['country', 'region']


class SeasonViewSet(viewsets.ModelViewSet):
    """ViewSet for Season model.
    
    List, create, retrieve, update, and delete seasons.
    """
    queryset = Season.objects.all()
    serializer_class = SeasonSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['year', 'program']
    ordering = ['-year']


class UserProfileViewSet(viewsets.ModelViewSet):
    """ViewSet for UserProfile model.
    
    List, create, retrieve, update, and delete user profiles.
    """
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['role', 'program']
```

---

## 2. GERMPLASM APP API

### Create: `backend/apps/germplasm/serializers.py`

```python
"""Serializers for germplasm app models."""

from rest_framework import serializers
from .models import Germplasm, Cross


class GermplasmSerializer(serializers.ModelSerializer):
    """Serializer for Germplasm model."""
    
    program_name = serializers.CharField(source='program.name', read_only=True)
    parent_female_name = serializers.CharField(source='parent_female.name', read_only=True)
    parent_male_name = serializers.CharField(source='parent_male.name', read_only=True)
    
    class Meta:
        model = Germplasm
        fields = [
            'id', 'name', 'germplasm_db_id', 'species', 'program', 'program_name',
            'parent_female', 'parent_female_name', 'parent_male', 'parent_male_name',
            'pedigree_string', 'cross_type', 'year_developed', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'germplasm_db_id', 'created_at']


class CrossSerializer(serializers.ModelSerializer):
    """Serializer for Cross model."""
    
    female_parent_name = serializers.CharField(source='female_parent.name', read_only=True)
    male_parent_name = serializers.CharField(source='male_parent.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    
    class Meta:
        model = Cross
        fields = [
            'id', 'cross_code', 'female_parent', 'female_parent_name',
            'male_parent', 'male_parent_name', 'cross_date', 'location',
            'location_name', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
```

### Create: `backend/apps/germplasm/viewsets.py`

```python
"""ViewSets for germplasm app models."""

from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Germplasm, Cross
from .serializers import GermplasmSerializer, CrossSerializer


class GermplasmViewSet(viewsets.ModelViewSet):
    """ViewSet for Germplasm model.
    
    List, create, retrieve, update, and delete germplasm lines.
    """
    queryset = Germplasm.objects.select_related('program', 'parent_female', 'parent_male')
    serializer_class = GermplasmSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'germplasm_db_id', 'pedigree_string']
    filterset_fields = ['program', 'cross_type']
    ordering_fields = ['name', 'year_developed', 'created_at']
    ordering = ['name']


class CrossViewSet(viewsets.ModelViewSet):
    """ViewSet for Cross model.
    
    List, create, retrieve, update, and delete crosses.
    """
    queryset = Cross.objects.select_related('female_parent', 'male_parent', 'location')
    serializer_class = CrossSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['cross_code', 'female_parent__name', 'male_parent__name']
    filterset_fields = ['location', 'cross_date']
    ordering = ['-cross_date']
```

---

## 3. TRIALS APP API

### Create: `backend/apps/trials/serializers.py`

```python
"""Serializers for trials app models."""

from rest_framework import serializers
from .models import Trial, Plot, ObservationVariable, Observation


class TrialSerializer(serializers.ModelSerializer):
    """Serializer for Trial model."""
    
    program_name = serializers.CharField(source='program.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    season_name = serializers.CharField(source='season.name', read_only=True)
    
    class Meta:
        model = Trial
        fields = [
            'id', 'name', 'trial_code', 'brapi_study_db_id', 'program', 'program_name',
            'location', 'location_name', 'season', 'season_name', 'design_type',
            'num_reps', 'planting_date', 'harvest_date', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'brapi_study_db_id', 'created_at', 'updated_at']


class PlotSerializer(serializers.ModelSerializer):
    """Serializer for Plot model."""
    
    trial_code = serializers.CharField(source='trial.trial_code', read_only=True)
    germplasm_name = serializers.CharField(source='germplasm.name', read_only=True)
    
    class Meta:
        model = Plot
        fields = [
            'id', 'trial', 'trial_code', 'germplasm', 'germplasm_name',
            'rep', 'block', 'plot_number', 'row', 'column', 'status'
        ]
        read_only_fields = ['id', 'trial_code']


class ObservationVariableSerializer(serializers.ModelSerializer):
    """Serializer for ObservationVariable model."""
    
    class Meta:
        model = ObservationVariable
        fields = [
            'id', 'name', 'variable_code', 'description', 'unit',
            'data_type', 'min_value', 'max_value', 'is_required', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ObservationSerializer(serializers.ModelSerializer):
    """Serializer for Observation model."""
    
    plot_number = serializers.IntegerField(source='plot.plot_number', read_only=True)
    variable_name = serializers.CharField(source='variable.name', read_only=True)
    
    class Meta:
        model = Observation
        fields = [
            'id', 'plot', 'plot_number', 'variable', 'variable_name',
            'observation_time', 'value_text', 'value_numeric', 'value_date',
            'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
```

### Create: `backend/apps/trials/viewsets.py`

```python
"""ViewSets for trials app models."""

from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Trial, Plot, ObservationVariable, Observation
from .serializers import (
    TrialSerializer,
    PlotSerializer,
    ObservationVariableSerializer,
    ObservationSerializer,
)


class TrialViewSet(viewsets.ModelViewSet):
    """ViewSet for Trial model.
    
    List, create, retrieve, update, and delete trials.
    """
    queryset = Trial.objects.select_related('program', 'location', 'season')
    serializer_class = TrialSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'trial_code']
    filterset_fields = ['program', 'location', 'season', 'design_type']
    ordering_fields = ['trial_code', 'planting_date']
    ordering = ['trial_code']


class PlotViewSet(viewsets.ModelViewSet):
    """ViewSet for Plot model.
    
    List, create, retrieve, update, and delete plots.
    """
    queryset = Plot.objects.select_related('trial', 'germplasm')
    serializer_class = PlotSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['germplasm__name', 'trial__trial_code']
    filterset_fields = ['trial', 'rep', 'status']


class ObservationVariableViewSet(viewsets.ModelViewSet):
    """ViewSet for ObservationVariable model.
    
    List, create, retrieve, update, and delete observation variables.
    """
    queryset = ObservationVariable.objects.all()
    serializer_class = ObservationVariableSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'variable_code']
    filterset_fields = ['data_type', 'is_required']


class ObservationViewSet(viewsets.ModelViewSet):
    """ViewSet for Observation model.
    
    List, create, retrieve, update, and delete observations.
    """
    queryset = Observation.objects.select_related('plot', 'variable')
    serializer_class = ObservationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['plot__trial__trial_code', 'variable__name']
    filterset_fields = ['plot', 'variable', 'observation_time']
```

---

## 4. URL Configuration

### Update: `backend/config/urls.py`

```python
"""URL configuration for wheat breeding platform."""

from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.authtoken import views as token_views
from rest_framework.documentation.views import get_schema_view
from rest_framework import permissions as drf_permissions

# Import viewsets from each app
from apps.core.viewsets import ProgramViewSet, LocationViewSet, SeasonViewSet, UserProfileViewSet
from apps.germplasm.viewsets import GermplasmViewSet, CrossViewSet
from apps.trials.viewsets import TrialViewSet, PlotViewSet, ObservationViewSet, ObservationVariableViewSet

# Create router and register viewsets
router = DefaultRouter(trailing_slash=False)
router.register(r'programs', ProgramViewSet, basename='program')
router.register(r'locations', LocationViewSet, basename='location')
router.register(r'seasons', SeasonViewSet, basename='season')
router.register(r'users', UserProfileViewSet, basename='user-profile')
router.register(r'germplasm', GermplasmViewSet, basename='germplasm')
router.register(r'crosses', CrossViewSet, basename='cross')
router.register(r'trials', TrialViewSet, basename='trial')
router.register(r'plots', PlotViewSet, basename='plot')
router.register(r'observations', ObservationViewSet, basename='observation')
router.register(r'observation-variables', ObservationVariableViewSet, basename='observation-variable')

# Schema view for API documentation (optional)
schema_view = get_schema_view(
    title='Wheat Breeding Platform API',
    description='REST API for wheat breeding data management',
    version='1.0.0',
    public=True,
    permission_classes=(drf_permissions.AllowAny,),
)

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    
    # API
    path('api/v1/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
    path('api/v1/auth-token/', token_views.obtain_auth_token),  # Token generation endpoint
    
    # Documentation
    path('api/docs/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
]
```

---

## 5. Testing API

### Test with curl:

```bash
# Get authentication token
curl -X POST http://localhost:8000/api/v1/auth-token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass"}'

# Response: {"token":"YOUR_TOKEN_HERE"}

# Use token to access API
TOKEN="YOUR_TOKEN_HERE"

# List programs
curl -H "Authorization: Token $TOKEN" http://localhost:8000/api/v1/programs/

# Create program
curl -X POST http://localhost:8000/api/v1/programs/ \
  -H "Authorization: Token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Winter Wheat 2026",
    "crop": "wheat",
    "description": "Winter wheat breeding program"
  }'

# Get specific program
curl -H "Authorization: Token $TOKEN" http://localhost:8000/api/v1/programs/1/

# Update program
curl -X PUT http://localhost:8000/api/v1/programs/1/ \
  -H "Authorization: Token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated description"}'

# Delete program
curl -X DELETE http://localhost:8000/api/v1/programs/1/ \
  -H "Authorization: Token $TOKEN"
```

---

## 6. API Endpoints Reference

### Core App
- `GET/POST /api/v1/programs/` - List/create programs
- `GET/PUT/DELETE /api/v1/programs/{id}/` - Retrieve/update/delete program
- `GET/POST /api/v1/locations/` - List/create locations
- `GET/PUT/DELETE /api/v1/locations/{id}/` - Retrieve/update/delete location
- `GET/POST /api/v1/seasons/` - List/create seasons
- `GET/PUT/DELETE /api/v1/seasons/{id}/` - Retrieve/update/delete season
- `GET /api/v1/users/` - List user profiles

### Germplasm App
- `GET/POST /api/v1/germplasm/` - List/create germplasm
- `GET/PUT/DELETE /api/v1/germplasm/{id}/` - Retrieve/update/delete germplasm
- `GET/POST /api/v1/crosses/` - List/create crosses
- `GET/PUT/DELETE /api/v1/crosses/{id}/` - Retrieve/update/delete cross

### Trials App
- `GET/POST /api/v1/trials/` - List/create trials
- `GET/PUT/DELETE /api/v1/trials/{id}/` - Retrieve/update/delete trial
- `GET/POST /api/v1/plots/` - List/create plots
- `GET/PUT/DELETE /api/v1/plots/{id}/` - Retrieve/update/delete plot
- `GET/POST /api/v1/observations/` - List/create observations
- `GET/PUT/DELETE /api/v1/observations/{id}/` - Retrieve/update/delete observation
- `GET/POST /api/v1/observation-variables/` - List/create observation variables
- `GET/PUT/DELETE /api/v1/observation-variables/{id}/` - Retrieve/update/delete variable

### Authentication
- `POST /api/v1/auth-token/` - Get authentication token
- `GET /api-auth/login/` - Browser login
- `GET /api-auth/logout/` - Browser logout

### Documentation
- `GET /api/docs/` - Swagger API documentation

