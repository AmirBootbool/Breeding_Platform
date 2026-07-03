# Wheat Breeding Platform — API Reference

> **Last updated:** July 3 2026
> This document describes the REST API as currently implemented.

---

## 1. Architecture Overview

| Layer | Detail |
|---|---|
| Framework | Django REST Framework |
| Auth | Token authentication (`rest_framework.authtoken`) |
| Permissions | Custom `RoleBasedPermission` class (role-aware RBAC) |
| Routing | One `DefaultRouter` per app; all included under the `api/` prefix in `config/urls.py` |

---

## 2. Authentication

Obtain a token by posting credentials to the token endpoint:

```bash
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret"}'
```

Response:

```json
{ "token": "abc123..." }
```

Include the token in subsequent requests:

```
Authorization: Token abc123...
```

---

## 3. Role-Based Access Control (RBAC)

All viewsets use **`RoleBasedPermission`** — not plain `IsAuthenticated`.

| Role | Capabilities |
|---|---|
| **admin** | Full read/write on every endpoint |
| **breeder** | Read all; write on most endpoints (except user profiles) |
| **technician** | Read all; write only on observations, and update/partial-update on plots |
| **viewer** | Read-only everywhere |

Per-viewset `write_roles` are listed in the endpoint table below. Some viewsets also define `role_action_permissions` to grant write access on specific actions (e.g. `PlotViewSet` allows technicians to `update` and `partial_update`).

---

## 4. Endpoint Reference

### 4.1 Core App (`apps/core/`)

#### Programs — `api/programs/`

| Write Roles | `admin`, `breeder` |
|---|---|

**Serializer fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| `name` | string | |
| `crop` | string | |
| `description` | string | |
| `created_at` | datetime | read-only |

#### Locations — `api/locations/`

| Write Roles | `admin`, `breeder` |
|---|---|

**Serializer fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| `name` | string | |
| `latitude` | decimal | |
| `longitude` | decimal | |
| `country` | string | |
| `region` | string | |

#### Seasons — `api/seasons/`

| Write Roles | `admin`, `breeder` |
|---|---|

Uses `select_related('program')` for efficient queries.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| `name` | string | |
| `year` | int | |
| `program` | int (FK) | |
| `program_name` | string | read-only, computed from `program.name` |

#### User Profiles — `api/user-profiles/`

| Write Roles | `admin` only |
|---|---|

Uses `select_related('user', 'program')`.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| `user` | int (FK) | |
| `username` | string | read-only, from `user.username` |
| `email` | string | read-only, from `user.email` |
| `role` | string | |
| `program` | int (FK) | |
| `program_name` | string | read-only, computed |
| `created_at` | datetime | read-only |
| `updated_at` | datetime | read-only |

---

### 4.2 Germplasm App (`apps/germplasm/`)

#### Germplasm — `api/germplasm/`

| Write Roles | `admin`, `breeder` |
|---|---|

Uses `select_related` for parent/program lookups.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| _model fields_ | — | all model fields included |
| `parent_female_name` | string | read-only, computed |
| `parent_male_name` | string | read-only, computed |
| `program_name` | string | read-only, computed |

#### Crosses — `api/crosses/`

| Write Roles | `admin`, `breeder` |
|---|---|

Uses `select_related` for parent/location lookups.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| _model fields_ | — | all model fields included |
| `female_parent_name` | string | read-only, computed |
| `male_parent_name` | string | read-only, computed |
| `location_name` | string | read-only, computed |

---

### 4.3 Trials App (`apps/trials/`)

#### Trials — `api/trials/`

| Write Roles | `admin`, `breeder` |
|---|---|

Annotates `plot_count`; uses `select_related('program', 'location', 'season')`.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| _model fields_ | — | all model fields included |
| `program_name` | string | read-only, computed |
| `location_name` | string | read-only, computed |
| `season_name` | string | read-only, computed |
| `plot_count` | int | read-only, annotated |

**Custom action — `create_plots`**

```
POST api/trials/{id}/create_plots/
```

Bulk-creates plots for a trial. Accessible to `admin` and `breeder` roles. Accepts a list of plot data in the request body and creates them linked to the specified trial.

```bash
curl -X POST http://localhost:8000/api/trials/1/create_plots/ \
  -H "Authorization: Token abc123..." \
  -H "Content-Type: application/json" \
  -d '[{"germplasm": 5, "plot_number": 1, "replication": 1}]'
```

#### Plots — `api/plots/`

| Write Roles | `admin`, `breeder` (create/delete) — `technician` may also `update`/`partial_update` |
|---|---|

Uses `select_related('trial', 'germplasm')`. The viewset defines `role_action_permissions` to extend write access for technicians on update actions.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| _model fields_ | — | all model fields included |
| `trial_code` | string | read-only, computed |
| `germplasm_name` | string | read-only, computed |

#### Observation Variables — `api/observation-variables/`

| Write Roles | `admin`, `breeder` |
|---|---|

All model fields are included in the serializer.

#### Observations — `api/observations/`

| Write Roles | `admin`, `breeder`, `technician` |
|---|---|

Uses `select_related` for related lookups.

| Field | Type | Notes |
|---|---|---|
| `id` | int | read-only |
| _model fields_ | — | all model fields included |
| `trial_code` | string | read-only, computed |
| `germplasm_name` | string | read-only, computed |
| `variable_name` | string | read-only, computed |

---

## 5. Searching & Ordering

All viewsets expose `search_fields` and `ordering_fields` via DRF's `SearchFilter` and `OrderingFilter` backends. Append query parameters:

```bash
# Search programs by name
curl "http://localhost:8000/api/programs/?search=wheat" \
  -H "Authorization: Token abc123..."

# Order germplasm by name descending
curl "http://localhost:8000/api/germplasm/?ordering=-name" \
  -H "Authorization: Token abc123..."
```

---

## 6. Common CRUD Examples

### Create a program

```bash
curl -X POST http://localhost:8000/api/programs/ \
  -H "Authorization: Token abc123..." \
  -H "Content-Type: application/json" \
  -d '{"name": "Spring Wheat 2026", "crop": "wheat", "description": "Main program"}'
```

### List seasons (with computed program_name)

```bash
curl http://localhost:8000/api/seasons/ \
  -H "Authorization: Token abc123..."
```

### Update a plot (as technician)

```bash
curl -X PATCH http://localhost:8000/api/plots/42/ \
  -H "Authorization: Token <technician-token>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Lodging observed"}'
```

### Record an observation (as technician)

```bash
curl -X POST http://localhost:8000/api/observations/ \
  -H "Authorization: Token <technician-token>" \
  -H "Content-Type: application/json" \
  -d '{"plot": 42, "variable": 3, "value": "8.5", "recorded_date": "2026-07-01"}'
```

---

## 7. Not Yet Implemented

The following features are planned but **not present** in the current codebase:

| Feature | Status |
|---|---|
| `DjangoFilterBackend` / `filterset_fields` | Not configured — field-level filtering (e.g. `?program=1`) is unavailable |
| Swagger / OpenAPI documentation | No `drf-spectacular` or `drf-yasg` integration |
| Rate limiting | No throttle classes configured |
