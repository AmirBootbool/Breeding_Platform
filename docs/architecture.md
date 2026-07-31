# Wheat Breeding Platform — Architecture & Engineering Reference

Last updated: 2026-07-31

## 1. Project Overview

### 1.1 Goal

A lean, self-hosted platform for managing a wheat breeding program's core
data: germplasm and pedigrees, crossing records, field trials and plot
layouts, and phenotypic observations. It exposes role-controlled internal APIs,
a BrAPI v2 compatibility API, and a Django Admin back office.

### 1.2 Current Scope

The following capabilities are implemented:

- Germplasm registry with self-referencing pedigree links and crossing records.
- Trial creation and seeded RCBD plot-layout generation.
- Plot lifecycle tracking and data-type-aware phenotypic observations.
- Per-trial numeric summary statistics: count, mean, minimum, maximum,
  standard deviation, and coefficient of variation.
- CSV germplasm import, trial-data export, and Field Book import/export.
- Token and session authentication with admin, breeder, technician, and viewer
  roles.
- Full internal REST API with searching, ordering, field filtering, structured
  error responses, and throttling.
- Read-only BrAPI v2 resources for server information, studies, germplasm,
  observations, observation variables, locations, programs, and observation
  units.
- OpenAPI 3 schema generation through drf-spectacular, with Swagger UI and
  ReDoc views.
- Django Admin, production logging, WhiteNoise static-file serving, Gunicorn,
  health checks, optional Redis caching and Sentry integration, and PostgreSQL
  backup guidance.
- SQLite development and PostgreSQL production database paths.
- 77 passing tests, plus one optional Sentry test skipped when the production
  dependency is absent.

### 1.3 Out of Scope

- Genomic data storage and analysis.
- Drone or image-based phenotyping.
- Multi-environment models such as heritability and genotype-by-environment
  analysis.
- Multi-institution data federation.
- BrAPI write operations.

### 1.4 Design Principles

1. Django Admin before a custom UI.
2. BrAPI-compatible external representations without coupling the internal API
   to BrAPI response shapes.
3. Conventional Python, Django, and Django REST Framework components.
4. Models own invariants, serializers own API shape, and services own
   multi-model workflows.
5. Environment-driven configuration with secure production defaults.

## 2. Technology and Components

| Component | Responsibility |
|---|---|
| Python 3.12+ / Django 5.1 | Application and domain model |
| Django REST Framework 3.15 | Internal and BrAPI HTTP APIs |
| `apps.core` | Programs, locations, seasons, profiles, and RBAC |
| `apps.germplasm` | Germplasm, pedigrees, crosses, and CSV import |
| `apps.trials` | Trials, plots, observations, statistics, and Field Book workflows |
| `apps.brapi` | Read-only BrAPI v2 serializers, pagination, routes, and views |
| drf-spectacular | OpenAPI 3 schema, Swagger UI, and ReDoc |
| django-filter | Field-level query-parameter filtering |
| SQLite / PostgreSQL 16 | Development / production persistence |
| WhiteNoise / Gunicorn | Production static files / WSGI serving |
| LocMem / Redis | Development / optional production caching |
| pytest + pytest-django | Unit and integration tests |
| black, isort, flake8 | Formatting and linting |
| python-decouple | Environment configuration |
| **Vite + React 18 + TypeScript** | **Custom browser frontend SPA** |
| **React Query + Zustand + Recharts** | **Frontend data, state, and charts** |

The platform is designed to run locally on a laptop without a GPU.

## 3. Data Model

### 3.1 Relationships

```text
Program 1:N Season
Program 1:N Germplasm
Program 1:N Trial
Program 1:N UserProfile
Location 1:N Trial
Location 1:N Cross
Season 1:N Trial
User 1:1 UserProfile

Germplasm self-FK parent_female / parent_male (SET_NULL)
Germplasm 1:N Cross as female or male parent (PROTECT)
Germplasm 1:N Plot (PROTECT)

Trial 1:N Plot (CASCADE)
Plot 1:N Observation (CASCADE)
ObservationVariable 1:N Observation (PROTECT)
```

### 3.2 Core Models

- `Program`: unique name, crop, description, and creation timestamp.
- `Location`: indexed name, coordinates, country, and region.
- `Season`: name, indexed year, and program; unique within
  `(name, program, year)`.
- `UserProfile`: one-to-one user, role, optional program, and timestamps.

### 3.3 Germplasm Models

- `Germplasm`: name, unique `germplasm_db_id`, species, program, optional
  parents, pedigree text, cross type, development year, notes, and timestamps.
- `Cross`: unique cross code, protected female and male parents, date,
  optional location, notes, and timestamps. Model validation prevents a record
  from using the same parent on both sides.

The automatic germplasm identifier strategy is recorded in
[ADR-0001](adr/0001-germplasm-identifier-save-strategy.md).

### 3.4 Trial Models

- `Trial`: unique code, optional BrAPI study ID, program, protected location
  and season, design type, replication count, dates, notes, and timestamps.
- `Plot`: trial, protected germplasm, replication/block/position fields,
  lifecycle status, and a trial-scoped unique plot number.
- `ObservationVariable`: global trait name and code, unit, type, validation
  range, required flag, and creation timestamp.
- `Observation`: plot, protected variable, observation time, typed value
  fields, notes, and creation timestamp.

Observation validation enforces the selected variable's data type, numeric
range, and whole-number requirement. The decision to keep traits global is
recorded in [ADR-0002](adr/0002-global-observation-variable-scope.md).

## 4. HTTP Interfaces

### 4.1 Internal API

Internal API endpoints are under `/api/`. Authentication is required except
for the health check and schema documentation.

| Endpoint | Purpose |
|---|---|
| `/api/auth/token/` | Obtain a DRF token |
| `/api/health/` | Public database health check |
| `/api/schema/` | OpenAPI 3 schema |
| `/api/schema/swagger-ui/` | Interactive Swagger UI |
| `/api/schema/redoc/` | ReDoc reference |
| `/api/programs/` | Program CRUD |
| `/api/locations/` | Location CRUD |
| `/api/seasons/` | Season CRUD |
| `/api/user-profiles/` | Profile and role CRUD |
| `/api/germplasm/` | Germplasm CRUD |
| `/api/crosses/` | Cross CRUD |
| `/api/trials/` | Trial CRUD |
| `/api/trials/{id}/create_plots/` | Generate an RCBD layout |
| `/api/trials/{id}/summary/` | Per-trait numeric statistics |
| `/api/plots/` | Plot CRUD |
| `/api/observation-variables/` | Trait vocabulary CRUD |
| `/api/observations/` | Observation CRUD |

List viewsets support `DjangoFilterBackend`, `SearchFilter`, and
`OrderingFilter`, with a default page size of 100.

### 4.2 BrAPI v2

Read-only compatibility endpoints are under `/brapi/v2/`:

- `serverinfo`
- `studies`
- `germplasm`
- `observations`
- `observationvariables` and its `variables` alias
- `locations`
- `programs`
- `observationunits`

BrAPI serializers translate internal models into camelCase BrAPI fields.
`BrapiPagination` provides the BrAPI `metadata` and `result.data` envelope.
These endpoints retain the project's default authentication requirement.

## 5. Role-Based Access Control

`RoleBasedPermission` in `apps/core/permissions.py` implements the role rules.

| Role | Default access |
|---|---|
| admin | Full access |
| breeder | Read access and most domain writes |
| technician | Read access, observation writes, and plot updates |
| viewer | Read only |

Staff and superusers are treated as admins. Authenticated users without a
profile are treated as viewers. Viewsets can override write roles per action.

## 6. Services and Data Exchange

`apps/trials/services.py` contains:

- `generate_rcbd_layout`: deterministic RCBD randomization when given a seed.
- `create_plots_for_trial`: validates preconditions and bulk-creates plots in
  a transaction.
- `compute_trial_summary`: calculates per-variable descriptive statistics.

Management commands provide:

- `import_germplasm`
- `export_trial_data`
- `export_fieldbook`
- `import_fieldbook`

Multi-row writes use transactions. Viewsets use `select_related` for foreign
keys, and plot generation uses `bulk_create`.

## 7. Repository Structure

```text
wheat-breeding-platform/
├── docs/
│   ├── adr/
│   ├── architecture.md
│   ├── deployment.md
│   └── history.md
├── backend/
│   ├── apps/
│   │   ├── brapi/
│   │   ├── core/
│   │   ├── germplasm/
│   │   └── trials/
│   ├── config/
│   ├── requirements/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/          ← typed API client
│   │   ├── components/   ← Sidebar, TopBar
│   │   ├── pages/        ← Login, Dashboard, GermplasmBrowser, TrialManager,
│   │   │                    ObservationEntry, DataExport
│   │   └── store/        ← Zustand auth store
│   ├── Dockerfile
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── scripts/backup_db.sh
├── docker-compose.yml
└── docker-compose.prod.yml
```

In-app tests cover models and services. Top-level `backend/tests` covers API,
admin, schema, integration, and management-command behavior.

## 8. Configuration and Security

Important production variables include:

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Required non-default cryptographic secret |
| `DJANGO_DEBUG` | Must be `False` in production |
| `DJANGO_ALLOWED_HOSTS` | Explicit host allowlist |
| `CORS_ALLOWED_ORIGINS` | Explicit browser-origin allowlist |
| `USE_SQLITE` | `False` selects the configured production database |
| `DATABASE_URL` | PostgreSQL connection URL |
| `SECURE_SSL_REDIRECT` | Enable HTTPS redirects |
| `SESSION_COOKIE_SECURE` | Restrict session cookies to HTTPS |
| `CSRF_COOKIE_SECURE` | Restrict CSRF cookies to HTTPS |
| `REDIS_URL` | Optional Redis cache |
| `SENTRY_DSN` | Optional Sentry monitoring |

Production starts fail when the secret key is absent or left at its example
value. Authentication is required by default, passwords use Django's four
validators with a 12-character minimum, CORS and hosts are allowlisted, API
errors use a structured handler, and anonymous/authenticated throttles are
configured.

## 9. Testing

The verified 2026-07-25 baseline is **79 passed and 1 skipped**. The skipped
test exercises optional Sentry initialization and runs when the production
Sentry dependency is installed.

| Area | Collected tests |
|---|---:|
| Core, germplasm, and trials model/service tests | 20 |
| Admin | 4 |
| Internal API CRUD and RBAC | 17 |
| Filtering | 8 |
| BrAPI and health check | 12 |
| Exception handling | 3 |
| OpenAPI, throttling, and caching hardening | 5 |
| Management commands | 7 |
| Optional Sentry integration | 2 |
| **Total** | **78** |

Run:

```powershell
cd backend
.\.venv\Scripts\python -m pytest -q
```

## 10. Accepted Decisions and Future Work

### 10.1 Accepted Architecture Decisions

- [ADR-0001: Germplasm identifier save strategy](adr/0001-germplasm-identifier-save-strategy.md)
- [ADR-0002: Global ObservationVariable scope](adr/0002-global-observation-variable-scope.md)

Earlier issues concerning filtering, exception formatting, foreign-key
protection, test duplication, deprecated dependencies, container startup,
Field Book exchange, trial summaries, BrAPI, schema documentation, and
production hardening are resolved and are no longer an active backlog.

### 10.2 Resolved Schema Typing Debt

Schema generation completes with 0 errors. W001 warnings from drf-spectacular for serializer method fields have been resolved by adding explicit `@extend_schema_field` metadata and Python type annotations. The only remaining warnings stem from the read-only BrAPI v2 endpoints, which do not impact internal frontend generation.

### 10.3 Remaining Product Opportunities

- BrAPI write support.
- Alpha-lattice and augmented layout-generation services.
- Spreadsheet formats beyond CSV.
- Advanced multi-environment and genomic analysis.

These are opportunities, not committed roadmap items.

## 11. Coding Rules

- Keep shared state in `apps.core`, pedigree work in `apps.germplasm`, trial
  work in `apps.trials`, and BrAPI translation in `apps.brapi`.
- Put cross-model workflows in services and bulk exchange in management
  commands.
- Validate payload shape in serializers, domain invariants in models, and
  workflow preconditions in services.
- Use `select_related`/`prefetch_related`, transactions, and bulk operations
  where appropriate.
- Add success and failure-path tests for behavior changes.
- Keep secrets and deployment-specific values in environment configuration.
