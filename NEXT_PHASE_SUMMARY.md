# Next Phase Summary

Date: 2026-07-03

## How to Use This Document

This is the handoff document for the wheat-breeding-platform. If you are an
AI coding assistant starting a new session:

1. Read this file first for context and current state.
2. Read `docs/architecture.md` for the data model and API reference.
3. Read `IMPLEMENTATION_ROADMAP.md` for the detailed task specifications.
4. Start implementation on whichever Phase 4 task the user requests.

## Current State

The platform has moved well beyond initial scaffolding. Here is what exists
and works today:

### Implemented (Phases 1-5 complete)

- **Security hardening**: SECRET_KEY from env with production guard,
  ALLOWED_HOSTS from env (not wildcard), CORS from env (not allow-all),
  password validators enabled (min 12 chars), token authentication endpoint,
  HTTPS cookie settings gated on DEBUG=False.
- **Full REST API**: All 3 domain apps (core, germplasm, trials) have
  serializers, viewsets, and URL routing via DRF routers. 12 CRUD endpoints
  plus a custom `create_plots` action on trials.
- **Role-based access control**: `RoleBasedPermission` class with per-action
  overrides. All viewsets use it. Tests verify viewer read-only, technician
  limited write, breeder full write.
- **Database design**: Indexes on key lookup fields (name, year, cross_date,
  observation_time, etc.). Timestamps (created_at/updated_at) on all mutable
  models. Unique constraints on identifiers.
- **Plot generation service**: RCBD layout with seeded randomization, atomic
  creation, sequential plot numbering, precondition validation.
- **Django Admin**: All 10 domain models registered with list_display,
  readonly_fields, search_fields, list_filter, and raw_id_fields.
- **Production readiness (Phase 5)**: Custom JSON logging, deployment hardening (Gunicorn and WhiteNoise static files storage configuration), BrAPI v2 read-only compatibility endpoints (`/studies`, `/germplasm`, `/observations`, `/variables`), and public `/api/health/` checks.
- **Testing**: 66 tests passing — models, API CRUD, RBAC enforcement, admin
  registration, unique constraints, plot generation, observation validation,
  custom exception handling formatting, query-parameter filtering, import/export management commands, trial summary statistics, FK protection checks, and BrAPI v2 endpoints.
- **Code quality tooling**: black, isort, flake8 configured in
  pyproject.toml / .flake8.


### What was marked TODO in earlier docs but is now done

| Earlier roadmap item              | Status  |
|-----------------------------------|---------|
| Core serializers and viewsets     | Done |
| Germplasm serializers and viewsets| Done |
| Trials serializers and viewsets   | Done |
| URL routing and router setup      | Done |
| Token auth endpoint               | Done |
| ALLOWED_HOSTS configuration       | Done |
| DEBUG default to False            | Done |
| SECRET_KEY from environment       | Done |
| Password validators              | Done |
| CORS configuration               | Done |
| Database indexes                  | Done |
| Timestamps on models             | Done |
| select_related() optimization    | Done |
| Test fixtures (conftest.py)      | Done |
| Admin readonly_fields            | Done |
| Code formatting config           | Done |
| django-filter integration         | Done |
| Custom exception handler          | Done |
| CSV import/export CLI commands    | Done |
| Trial summary stats endpoint      | Done |
| Test consolidation                | Done |
| FK cascade review                 | Done |
| Stale file & coreapi cleanup      | Done |
| Production readiness (Phase 5)    | Done |

---

## Next Steps

All planned phases (Phases 1 through 5) are now fully implemented and verified! The platform is production-ready, featuring structured JSON logging, WhiteNoise asset compilation, Gunicorn WSGI setup, a public health check, and a read-only BrAPI v2 integration.

---


## Key Conventions the Builder Must Follow

### File Organization
- Shared domain state → `apps/core`
- Germplasm and pedigree → `apps/germplasm`
- Trials, plots, observations → `apps/trials`
- Cross-cutting workflows → service modules (e.g., `services.py`)
- Bulk import/export → management commands (e.g., `management/commands/`)

### Code Patterns (match existing style)
- **Viewsets**: Use `RoleBasedPermission`, set `write_roles` as a set,
  use `search_fields` and `ordering_fields` as class attributes.
- **Querysets**: Always use `select_related()` for FK lookups in list views.
- **Serializers**: Include read-only computed fields for FK display names
  (e.g., `program_name = serializers.CharField(source="program.name", read_only=True)`).
- **Validation**: Use model `clean()` + `full_clean()` in `save()` for
  domain invariants. Use serializer `validate()` for API-level checks.
- **Services**: Wrap multi-model writes in `transaction.atomic()`. Raise
  `django.core.exceptions.ValidationError` with dict messages.
- **Settings**: Use `python-decouple` `config()` for env vars, not `os.environ`.
- **Imports**: Use `from apps.core.models import ...` (absolute from apps).

### Testing Patterns
- In-app `tests/test_models.py` for model unit tests.
- Top-level `tests/` for API integration, RBAC, and management command tests.
- Use `conftest.py` fixtures: `auth_client` (breeder), `client_for_role(role)`.
- Mark all DB tests with `@pytest.mark.django_db`.
- Test both success and permission-denied paths for each role.

### Verification After Any Change
```powershell
cd backend
.venv\Scripts\python -m pytest -q
```
All 52+ tests must pass. Run this after every task.
