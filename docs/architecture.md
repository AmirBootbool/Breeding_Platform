Wheat Breeding Platform — Architecture & Engineering Reference

Last updated: 2026-07-02

---

1. Project Overview

1.1 Goal

A lean, self-hosted platform for managing a wheat breeding program's core data:
germplasm and pedigree records, crossing blocks, field trials with plot layouts,
and phenotypic observations — with role-based access and a REST API.

1.2 Current Scope (implemented)

- Germplasm registry with pedigree tracking (self-referencing parents)
- Crossing block records linked to germplasm and locations
- Trial creation with RCBD plot layout generation (seeded randomization)
- Plot lifecycle tracking (planned → planted → harvested → discarded)
- Phenotypic observation capture with per-data-type validation
- Role-based access control (admin / breeder / technician / viewer)
- Full REST API with token authentication
- Django Admin back-office with search, filters, and readonly timestamps
- SQLite for local development; PostgreSQL via Docker Compose for production
- 34 passing tests covering models, API CRUD, and RBAC enforcement

1.3 Out of Scope (future phases)

- Field Book Android app integration (CSV import/export pipelines)
- BrAPI v2 endpoint subset (data model has `brapi_study_db_id` stub ready)
- Genomic data storage and analysis
- Drone / image-based phenotyping
- Multi-environment trial statistics (heritability, GxE models)
- Multi-institution data federation

1.4 Design Principles

1. Admin UI before custom UI — Django Admin is the primary back-office tool.
2. BrAPI-compatible data model — core entities map to BrAPI v2 resources.
3. Boring technology — Python/Django/DRF for maximum AI-assistant and
   community support.
4. Schema-first — data model stabilized before business logic.
5. Service layer for workflow logic — models own invariants, serializers own
   API shape, services own cross-cutting workflows.

---

2. Technology Stack

| Layer               | Choice                                      |
|---------------------|---------------------------------------------|
| Language            | Python 3.12+                                |
| Backend framework   | Django 5.1 + Django REST Framework 3.15     |
| Database (dev)      | SQLite                                      |
| Database (prod)     | PostgreSQL 16                               |
| Authentication      | Session + Token (DRF `obtain_auth_token`)   |
| Filtering           | `SearchFilter`, `OrderingFilter`            |
| CORS                | django-cors-headers                         |
| Containerization    | Docker Compose (web + db services)          |
| Testing             | pytest 8 + pytest-django 4                  |
| Code quality        | black, isort, flake8                        |
| Config management   | python-decouple (`.env` files)              |

Hard constraint: Everything must run locally on a laptop with no GPU and 16 GB RAM.

---

3. Data Model

3.1 Entity-Relationship Summary

```
Program ──1:N──→ Season
Program ──1:N──→ Germplasm
Program ──1:N──→ Trial
Program ──1:N──→ UserProfile (members)
Location ──1:N──→ Trial
Location ──1:N──→ Cross
Season  ──1:N──→ Trial
User    ──1:1──→ UserProfile

Germplasm ──self FK──→ parent_female / parent_male  (SET_NULL)
Germplasm ──1:N──→ Cross (as female/male parent, PROTECT)
Germplasm ──1:N──→ Plot  (CASCADE)

Trial ──1:N──→ Plot
Plot  ──1:N──→ Observation
ObservationVariable ──1:N──→ Observation (PROTECT)
```

3.2 Core App Models

Program
  - name (CharField, 255, unique)
  - crop (CharField, 255, default="wheat")
  - description (TextField, blank)
  - created_at (auto)

Location
  - name (CharField, 255, indexed)
  - latitude / longitude (FloatField, nullable)
  - country / region (CharField, 255, blank)

Season
  - name (CharField, 200)
  - year (IntegerField, indexed)
  - program (FK → Program, CASCADE)
  - unique_together: (name, program, year)

UserProfile
  - user (OneToOne → User, CASCADE, related_name="profile")
  - role (admin | breeder | technician | viewer, default=viewer, indexed)
  - program (FK → Program, SET_NULL, nullable)
  - created_at / updated_at (auto)

3.3 Germplasm App Models

Germplasm
  - name (CharField, 300, indexed)
  - germplasm_db_id (CharField, 100, unique, auto-generated as G{pk:06d})
  - species (CharField, 100, default="Triticum aestivum")
  - program (FK → Program, CASCADE, related_name="germplasm")
  - parent_female / parent_male (self FK, SET_NULL, nullable)
  - pedigree_string (CharField, 500, blank)
  - cross_type (biparental | self | backcross | doubled_haploid | other | unknown)
  - year_developed (IntegerField, nullable)
  - notes, created_at, updated_at

Cross
  - cross_code (CharField, 100, unique)
  - female_parent / male_parent (FK → Germplasm, PROTECT)
  - cross_date (DateField, indexed)
  - location (FK → Location, SET_NULL, nullable)
  - notes, created_at, updated_at
  - Validation: female_parent ≠ male_parent (clean + full_clean in save)

3.4 Trials App Models

Trial
  - name (CharField, 255, indexed)
  - trial_code (CharField, 255, unique)
  - brapi_study_db_id (CharField, 255, blank — BrAPI stub)
  - program (FK → Program, CASCADE)
  - location (FK → Location, CASCADE)
  - season (FK → Season, CASCADE)
  - design_type (RCBD | alpha_lattice | augmented | unreplicated | other)
  - num_reps (IntegerField, default=1, validated ≥ 1)
  - planting_date / harvest_date (DateField, nullable)
  - notes, created_at, updated_at

Plot
  - trial (FK → Trial, CASCADE, related_name="plots")
  - germplasm (FK → Germplasm, CASCADE)
  - rep (IntegerField)
  - block (IntegerField, nullable)
  - plot_number (IntegerField)
  - row / column (IntegerField, nullable)
  - status (planned | planted | harvested | discarded)
  - unique_together: (trial, plot_number)

ObservationVariable
  - name (CharField, 255, indexed)
  - variable_code (CharField, 100, blank)
  - description (TextField, blank)
  - unit (CharField, 64, blank)
  - data_type (numeric | integer | categorical | text | date)
  - min_value / max_value (FloatField, nullable, validated min ≤ max)
  - is_required (BooleanField, default=False)
  - created_at (auto)

Observation
  - plot (FK → Plot, CASCADE, related_name="observations")
  - variable (FK → ObservationVariable, PROTECT)
  - observation_time (DateTimeField, nullable, indexed)
  - value_text (TextField, blank)
  - value_numeric (FloatField, nullable)
  - value_date (DateField, nullable)
  - notes, created_at
  - Validation: enforces required value per data_type; range checks for
    numeric/integer against variable min/max; integer whole-number check

---

4. API Endpoints

All endpoints require authentication (session or token). Write operations are
gated by role-based permissions.

| Endpoint                              | Methods | Write Roles                     |
|---------------------------------------|---------|----------------------------------|
| `api/auth/token/`                     | POST    | any (returns auth token)         |
| `api/programs/`                       | CRUD    | admin, breeder                   |
| `api/locations/`                      | CRUD    | admin, breeder                   |
| `api/seasons/`                        | CRUD    | admin, breeder                   |
| `api/user-profiles/`                  | CRUD    | admin only                       |
| `api/germplasm/`                      | CRUD    | admin, breeder                   |
| `api/crosses/`                        | CRUD    | admin, breeder                   |
| `api/trials/`                         | CRUD    | admin, breeder                   |
| `api/trials/{id}/create_plots/`       | POST    | admin, breeder                   |
| `api/plots/`                          | CRUD    | create/delete: admin, breeder    |
|                                       |         | update: + technician             |
| `api/observation-variables/`          | CRUD    | admin, breeder                   |
| `api/observations/`                   | CRUD    | admin, breeder, technician       |

All list endpoints support:
  - SearchFilter (full-text across configured fields)
  - OrderingFilter (sortable on configured fields)
  - PageNumberPagination (100 items per page)

---

5. Role-Based Access Control

Implemented via `RoleBasedPermission` in `apps/core/permissions.py`.

| Role        | Read | Write (default)    | Observation Write | Plot Status Update |
|-------------|------|--------------------|-------------------|--------------------|
| admin       | ✓    | ✓                  | ✓                 | ✓                  |
| breeder     | ✓    | ✓                  | ✓                 | ✓                  |
| technician  | ✓    | ✗                  | ✓                 | ✓                  |
| viewer      | ✓    | ✗                  | ✗                 | ✗                  |

- Superusers and staff users are treated as "admin".
- Users without a UserProfile default to "viewer".
- Per-action overrides are supported via `role_action_permissions` on viewsets.

---

6. Services & Business Logic

6.1 RCBD Plot Generation (`apps/trials/services.py`)

- `generate_rcbd_layout(entries, num_reps, seed)` — creates a randomized
  complete block design using a seeded RNG for reproducibility.
- `create_plots_for_trial(trial, entries, seed)` — validates preconditions
  (entries not empty, num_reps ≥ 1, no existing plots), generates layout,
  creates Plot objects in an atomic transaction with sequential plot numbers.
- Exposed via `POST /api/trials/{id}/create_plots/` (accepts optional
  `germplasm_ids` array and `seed`; defaults to all program germplasm).

---

7. Repository Structure

```
wheat-breeding-platform/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── docs/
│   └── architecture.md          ← this document
├── backend/
│   ├── .env                     ← local overrides (gitignored)
│   ├── .flake8
│   ├── pyproject.toml           ← black + isort config
│   ├── pytest.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── manage.py
│   ├── config/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── core/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py
│   │   │   ├── permissions.py
│   │   │   ├── urls.py
│   │   │   ├── admin.py
│   │   │   └── tests/test_models.py
│   │   ├── germplasm/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py
│   │   │   ├── urls.py
│   │   │   ├── admin.py
│   │   │   └── tests/test_models.py
│   │   └── trials/
│   │       ├── models.py
│   │       ├── serializers.py
│   │       ├── viewsets.py
│   │       ├── services.py      ← RCBD layout + plot creation
│   │       ├── utils.py          ← re-exports from services
│   │       ├── urls.py
│   │       ├── admin.py
│   │       └── tests/test_models.py
│   └── tests/                   ← integration / cross-app tests
│       ├── conftest.py
│       ├── test_admin.py
│       ├── test_api_core.py
│       ├── test_api_germplasm.py
│       ├── test_api_trials.py
│       ├── test_core.py
│       ├── test_germplasm.py
│       ├── test_plot_constraints.py
│       └── test_trials.py
```

---

8. Configuration & Security

8.1 Environment Variables

| Variable                | Default (dev)                     | Notes                            |
|-------------------------|-----------------------------------|----------------------------------|
| DJANGO_SECRET_KEY       | (none — insecure fallback in DEBUG) | Required for production        |
| DJANGO_DEBUG            | False                             | Set True for local dev           |
| DJANGO_ALLOWED_HOSTS    | localhost,127.0.0.1               | Comma-separated                  |
| USE_SQLITE              | True                              | Set False for Postgres           |
| DATABASE_URL            | (empty)                           | Postgres connection string       |
| CORS_ALLOWED_ORIGINS    | http://localhost:3000,...          | Comma-separated origins          |
| SECURE_SSL_REDIRECT     | False                             | Production HTTPS settings        |
| SESSION_COOKIE_SECURE   | False                             | (same)                           |
| CSRF_COOKIE_SECURE      | False                             | (same)                           |

8.2 Security Measures Implemented

- SECRET_KEY loaded from env; ValueError raised in production if missing
- ALLOWED_HOSTS restricted to configured domains (not wildcard)
- CORS configured with explicit allowed origins (not allow-all)
- Password validators enabled (similarity, min length 12, common, numeric)
- Token authentication available at `api/auth/token/`
- CSRF and session cookie hardening enabled in production mode
- XSS filter and Content-Security-Policy headers
- All API endpoints require authentication by default

---

9. Testing

34 tests, all passing.

| File                       | Tests | Coverage Area                             |
|----------------------------|-------|-------------------------------------------|
| core/tests/test_models     | 5     | Model __str__, unique constraints, defaults|
| germplasm/tests/test_models| 4     | Pedigree links, Cross, unique constraints  |
| trials/tests/test_models   | 5     | RCBD layout, plot creation, observation validation |
| tests/test_api_core        | 4     | Auth enforcement, CRUD, RBAC for programs/profiles |
| tests/test_api_germplasm   | 2     | Germplasm CRUD, technician write block     |
| tests/test_api_trials      | 7     | create_plots endpoint, RBAC per-action, observation write |
| tests/test_admin           | 3     | Admin registration, readonly fields, search/filter |
| tests/test_core            | 1     | Core model integration + timestamps        |
| tests/test_germplasm       | 1     | Pedigree + cross integration               |
| tests/test_plot_constraints| 1     | Unique plot_number constraint              |
| tests/test_trials          | 1     | RCBD generation + timestamps               |

---

10. Open Decisions & Known Issues

10.1 Design Decisions Needed

- django-filter integration: viewsets have SearchFilter and OrderingFilter
  but no DjangoFilterBackend with filterset_fields yet (django-filter is in
  INSTALLED_APPS and requirements but not wired to viewsets)
- Exception handler: no custom exception handler wired in REST_FRAMEWORK
  settings (exception_handlers.py mentioned in earlier docs does not exist)
- ObservationVariable is global (not program-scoped) — could cause naming
  conflicts across programs
- Plot.germplasm uses CASCADE — deleting germplasm deletes plots and
  observations; PROTECT may be safer
- Trial.location and Trial.season use CASCADE — deletion cascades to trials;
  PROTECT may be safer

10.2 Technical Debt

- Germplasm.save() double-save pattern for auto-generated germplasm_db_id
  (saves once to get PK, then raw update to set ID — bypasses signals)
- Trial.create_plots() model method duplicates the import path already used
  by the viewset (viewset imports services.py directly)
- Duplicate test coverage: plot unique constraint and RCBD layout tests exist
  in both in-app tests/ and top-level tests/
- coreapi package in requirements is deprecated
- Dockerfile has no EXPOSE or CMD (relies on docker-compose)
- flake_remaining.txt is stale

10.3 Future Phases

- Field Book integration (CSV export/import management commands)
- BrAPI v2 endpoint subset
- Alpha-lattice and augmented design types
- Per-trial summary statistics (mean, CV, min/max per trait)
- CSV/Excel data export
- Genomic data storage (separate project phase)
- R integration for advanced statistics

---

11. Coding Rules

These rules apply when implementing or reviewing code in this repo:

11.1 Structure

- Put shared domain state in `apps/core`.
- Put germplasm and pedigree logic in `apps/germplasm`.
- Put trial, plot, and observation logic in `apps/trials`.
- Put cross-cutting workflow logic in service modules (e.g., `services.py`).
- Keep serializers responsible for API shape, viewsets for HTTP flow,
  models for persistence and invariants.
- Use management commands for bulk imports, exports, and maintenance tasks.

11.2 Best Practices

- Use `select_related()` and `prefetch_related()` for related data access.
- Use database transactions for multi-row writes.
- Validate at the right layer: serializer for payloads, model for invariants,
  service for workflow rules.
- Avoid hardcoded secrets, hosts, and environment-specific values.
- Add tests for every behavior change, including failure paths.
- Keep naming domain-specific and consistent with breeder workflows.

11.3 Review Checklist

- Does the change fit the existing app boundary?
- Is the business rule in the right layer?
- Are error cases handled cleanly?
- Are tests covering the new behavior?
- Would this still be obvious six months from now?
