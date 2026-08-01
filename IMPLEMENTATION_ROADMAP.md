# Implementation Roadmap

Updated: 2026-07-20

This roadmap contains detailed implementation instructions for each task.
Each section is self-contained: a builder model can read any single section
and implement it without reading the others.

---

## Phase Summary

| Phase | Status        | Description                       |
|-------|---------------|-----------------------------------|
| 1     | ✅ Done       | Security hardening                |
| 2     | ✅ Done       | REST API implementation           |
| 3     | ✅ Done       | Database optimization             |
| 4     | ✅ Done       | Feature completeness & quality    |
| 5     | ✅ Done       | Production readiness              |
| 6     | ✅ Done       | Documentation & tech-debt cleanup |
| 7     | ✅ Done       | Custom browser frontend           |
| 8     | ✅ Done       | Frontend CRUD Operations          |
| 9     | ✅ Done       | Frontend depth & bulk workflows   |
| 10    | ✅ Done       | Alpha-lattice & augmented designs |
| 11    | ✅ Done       | BrAPI v2 write support            |
| 12    | 🔲 Planned    | Observability & ops hardening     |


---

## Phase 1: Security Hardening — ✅ COMPLETE

- [x] SECRET_KEY loaded from environment; ValueError in production if missing
- [x] DEBUG defaults to False
- [x] ALLOWED_HOSTS from env, defaults to localhost only (not wildcard)
- [x] Password validators enabled (min 12 chars, 4 validators)
- [x] Token authentication configured and endpoint live
- [x] CORS from env with explicit origins (not allow-all)
- [x] HTTPS cookie settings gated on DEBUG=False
- [x] Content-Security-Policy and XSS filter headers

---

## Phase 2: REST API Implementation — ✅ COMPLETE

- [x] Core serializers + viewsets (Program, Location, Season, UserProfile)
- [x] Germplasm serializers + viewsets (Germplasm, Cross)
- [x] Trials serializers + viewsets (Trial, Plot, ObservationVariable, Observation)
- [x] URL routing via DRF DefaultRouter
- [x] Token auth endpoint (`api/auth/token/`)
- [x] RoleBasedPermission with per-action overrides
- [x] Custom `create_plots` action on TrialViewSet
- [x] Computed fields (program_name, plot_count, etc.) on serializers
- [x] SearchFilter and OrderingFilter on all viewsets

---

## Phase 3: Database Optimization — ✅ COMPLETE

- [x] Indexes on lookup fields (name, year, cross_date, observation_time, etc.)
- [x] Timestamps (created_at/updated_at) on all mutable models
- [x] select_related() on all viewset querysets
- [x] Unique constraints (germplasm_db_id, trial_code, cross_code, plot number)
- [x] Model validation via clean() + full_clean() in save()
- [x] CheckConstraint on ObservationVariable (min ≤ max)
- [x] Cross self-referencing validation (female ≠ male)

---

## Phase 4: Feature Completeness & Quality — ✅ COMPLETE

### 4.1 django-filter Integration (1–2 hours)

**Goal:** Enable query-parameter filtering (e.g., `?program=3&design_type=RCBD`)
on all list endpoints.

**Context:** `django-filter` is already in `requirements.txt` and
`django_filters` is NOT currently in INSTALLED_APPS (only `django-cors-headers`
is). The viewsets currently only have `SearchFilter` and `OrderingFilter`.

**Step-by-step implementation:**

1. Add `"django_filters"` to `INSTALLED_APPS` in `config/settings.py`.

2. Add `"django_filters.rest_framework.DjangoFilterBackend"` to the
   `DEFAULT_FILTER_BACKENDS` list in `REST_FRAMEWORK` settings — put it as
   the first item before `SearchFilter` and `OrderingFilter`.

3. Add `filterset_fields` to each viewset. Use this exact mapping:

   | File                              | ViewSet                    | Add attribute                                          |
   |-----------------------------------|----------------------------|--------------------------------------------------------|
   | `apps/core/viewsets.py`           | `ProgramViewSet`           | `filterset_fields = ["crop"]`                          |
   | `apps/core/viewsets.py`           | `LocationViewSet`          | `filterset_fields = ["country", "region"]`             |
   | `apps/core/viewsets.py`           | `SeasonViewSet`            | `filterset_fields = ["year", "program"]`               |
   | `apps/core/viewsets.py`           | `UserProfileViewSet`       | `filterset_fields = ["role", "program"]`               |
   | `apps/germplasm/viewsets.py`      | `GermplasmViewSet`         | `filterset_fields = ["program", "cross_type", "species"]` |
   | `apps/germplasm/viewsets.py`      | `CrossViewSet`             | `filterset_fields = ["female_parent", "male_parent", "location"]` |
   | `apps/trials/viewsets.py`         | `TrialViewSet`             | `filterset_fields = ["program", "season", "location", "design_type"]` |
   | `apps/trials/viewsets.py`         | `PlotViewSet`              | `filterset_fields = ["trial", "germplasm", "rep", "status"]` |
   | `apps/trials/viewsets.py`         | `ObservationVariableViewSet` | `filterset_fields = ["data_type", "is_required"]`    |
   | `apps/trials/viewsets.py`         | `ObservationViewSet`       | `filterset_fields = ["plot", "variable", "plot__trial"]` |

4. **Tests to add** (in `tests/test_api_trials.py` or a new
   `tests/test_api_filtering.py`):
   - Test that `GET /api/trials/?program={id}` returns only matching trials.
   - Test that `GET /api/germplasm/?cross_type=biparental` filters correctly.
   - Test that `GET /api/observations/?plot__trial={id}` filters by trial.

5. **Verify**: Run `python -m pytest -q`. All existing + new tests must pass.

---

### 4.2 Custom Exception Handler (1 hour)

**Goal:** Return structured JSON error responses from the API instead of
DRF's default format.

**Step-by-step implementation:**

1. Create `backend/config/exception_handlers.py`:

```python
from rest_framework.views import exception_handler

from django.core.exceptions import ValidationError as DjangoValidationError


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        from rest_framework.exceptions import ValidationError
        if hasattr(exc, "message_dict"):
            exc = ValidationError(detail=exc.message_dict)
        else:
            exc = ValidationError(detail=exc.messages)

    response = exception_handler(exc, context)

    if response is not None:
        response.data = {
            "status_code": response.status_code,
            "errors": response.data,
        }

    return response
```

2. Wire it into `config/settings.py` by adding to `REST_FRAMEWORK`:

```python
"EXCEPTION_HANDLER": "config.exception_handlers.api_exception_handler",
```

3. **Tests to add** (in `tests/test_api_core.py` or new
   `tests/test_exception_handler.py`):
   - Test that a 401 response has keys `status_code` and `errors`.
   - Test that a validation error (e.g., creating a program with a
     duplicate name) returns `status_code: 400` with field-level errors
     in `errors`.

4. **Verify**: Run `python -m pytest -q`. Check that existing tests still
   pass (some may need minor assertions updated if they check `response.data`
   structure directly — look for tests checking `response.data["count"]`
   which are on success responses and should be unaffected).

---

### 4.3 CSV Import / Export Commands (4–6 hours)

**Goal:** Give breeders working CLI tools to move data in and out of the
system using CSV files.

**Context:** Breeders currently have germplasm data in spreadsheets and need
to get observation data out for analysis. Field Book is an Android app that
imports/exports CSV.

**Step-by-step implementation:**

#### 4.3.1 `import_germplasm` command

1. Create `backend/apps/germplasm/management/__init__.py` (empty).
2. Create `backend/apps/germplasm/management/commands/__init__.py` (empty).
3. Create `backend/apps/germplasm/management/commands/import_germplasm.py`:

```python
import csv
from django.core.management.base import BaseCommand, CommandError
from apps.core.models import Program
from apps.germplasm.models import Germplasm


class Command(BaseCommand):
    help = "Import germplasm records from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument("csv_file", help="Path to the CSV file")
        parser.add_argument("--program", required=True, help="Program name")
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Validate without saving",
        )

    def handle(self, *args, **options):
        try:
            program = Program.objects.get(name=options["program"])
        except Program.DoesNotExist:
            raise CommandError(f"Program '{options['program']}' not found.")

        # Expected CSV columns: name, species, pedigree_string, cross_type,
        # year_developed, notes
        # Only 'name' is required.
        ...  # implement: open csv, iterate rows, create Germplasm objects
        # Use transaction.atomic() for the batch
        # Print summary: created count, skipped count, error count
```

   Expected CSV format (document in `--help`):
   ```
   name,species,pedigree_string,cross_type,year_developed,notes
   KAUZ,Triticum aestivum,KAUZ/PASTOR,biparental,2015,
   ```

#### 4.3.2 `export_trial_data` command

1. Create `backend/apps/trials/management/commands/export_trial_data.py`.
2. Accept `--trial` (trial_code) and `--output` (file path, default stdout).
3. Query all observations for the trial via:
   ```python
   Observation.objects.filter(plot__trial=trial).select_related(
       "plot__germplasm", "variable"
   )
   ```
4. Output CSV with columns: `plot_number, germplasm_name, rep, variable_name,
   value_numeric, value_text, value_date, observation_time, notes`.

#### 4.3.3 `export_fieldbook` command

1. Create `backend/apps/trials/management/commands/export_fieldbook.py`.
2. Field Book expects a CSV with at minimum: `plot_id, range, plot, entry`.
   Map these to: `plot_number, rep, plot_number, germplasm_name`.
3. Also include trait columns as empty headers (one per
   `ObservationVariable`).

#### 4.3.4 `import_fieldbook` command

1. Create `backend/apps/trials/management/commands/import_fieldbook.py`.
2. Accept `--trial` (trial_code) and the CSV file path.
3. Field Book exports CSV with columns: `plot_id` + one column per trait.
4. Match `plot_id` to `Plot.plot_number`, trait column headers to
   `ObservationVariable.name`, create `Observation` records.
5. Use `transaction.atomic()`.

**Tests for all commands:** Add `tests/test_management_commands.py`:
- Test `import_germplasm` with a sample CSV (use `io.StringIO`).
- Test `export_trial_data` produces expected CSV rows.
- Test `import_germplasm --dry-run` does not create records.
- Test error handling for missing program, bad CSV format.

**Verify**: `python -m pytest -q`.

---

### 4.4 Per-Trial Summary Statistics (2 hours)

**Goal:** Add a `summary` endpoint on trials that returns trait statistics.

**Step-by-step implementation:**

1. Add a service function in `apps/trials/services.py`:

```python
from django.db.models import Avg, Min, Max, StdDev, Count

def compute_trial_summary(trial):
    """Return per-variable stats for all observations in a trial."""
    from .models import Observation
    stats = (
        Observation.objects.filter(
            plot__trial=trial, value_numeric__isnull=False
        )
        .values("variable__name", "variable__unit")
        .annotate(
            count=Count("id"),
            mean=Avg("value_numeric"),
            min_val=Min("value_numeric"),
            max_val=Max("value_numeric"),
            std_dev=StdDev("value_numeric"),
        )
        .order_by("variable__name")
    )
    results = []
    for row in stats:
        cv = None
        if row["mean"] and row["std_dev"]:
            cv = round((row["std_dev"] / row["mean"]) * 100, 2)
        results.append({
            "variable": row["variable__name"],
            "unit": row["variable__unit"],
            "count": row["count"],
            "mean": round(row["mean"], 4) if row["mean"] else None,
            "min": row["min_val"],
            "max": row["max_val"],
            "std_dev": round(row["std_dev"], 4) if row["std_dev"] else None,
            "cv_percent": cv,
        })
    return results
```

2. Add the action to `TrialViewSet` in `apps/trials/viewsets.py`:

```python
@action(detail=True, methods=["get"])
def summary(self, request, pk=None):
    trial = self.get_object()
    stats = compute_trial_summary(trial)
    return Response({"trial": trial.trial_code, "summary": stats})
```

   Import `compute_trial_summary` from `.services`.

3. **Tests** (in `tests/test_api_trials.py`):
   - Create a trial with plots and observations, call
     `GET /api/trials/{id}/summary/`, verify response has `mean`, `cv_percent`.
   - Test with no observations returns empty summary list.

4. **Verify**: `python -m pytest -q`.

---

### 4.5 Test Consolidation (1 hour)

**Goal:** Remove duplicate tests and establish a clear convention.

**Convention to enforce:**
- `apps/*/tests/test_models.py` — model-level unit tests (str, validation,
  constraints, service functions).
- `tests/test_api_*.py` — API integration tests (CRUD, RBAC, endpoint behavior).
- `tests/test_admin.py` — admin registration and configuration.

**Step-by-step implementation:**

1. **Remove `tests/test_plot_constraints.py`** — its test
   (`test_plot_unique_number_within_trial`) is duplicated in
   `apps/trials/tests/test_models.py`.

2. **Remove `tests/test_trials.py`** — its test
   (`test_generate_rcbd_layout_and_create`) is duplicated in
   `apps/trials/tests/test_models.py` (which has both
   `test_generate_rcbd_layout_consistency` and `test_create_plots_for_trial`).

3. **Remove `tests/test_core.py`** — its test
   (`test_core_models_and_userprofile`) overlaps with the 5 tests in
   `apps/core/tests/test_models.py`.

4. **Remove `tests/test_germplasm.py`** — its test
   (`test_germplasm_parents_and_cross`) overlaps with the 4 tests in
   `apps/germplasm/tests/test_models.py`.

5. **Add missing negative API tests** to `tests/test_api_germplasm.py`:
   - `test_cross_self_cross_via_api` — POST a cross where female == male,
     expect 400.
   - `test_duplicate_germplasm_db_id_via_api` — POST two germplasm with
     same germplasm_db_id, expect 400 on second.

6. **Verify**: `python -m pytest -q`. Test count should decrease slightly
   (removed ~4 duplicates) then increase by 2 (new negative tests). All
   must pass.

---

### 4.6 FK Cascade Review (1 hour)

**Goal:** Prevent accidental data loss from cascade deletes.

**Step-by-step implementation:**

1. In `apps/trials/models.py`, change `Plot.germplasm`:
   ```python
   # Before:
   germplasm = models.ForeignKey(Germplasm, on_delete=models.CASCADE)
   # After:
   germplasm = models.ForeignKey(Germplasm, on_delete=models.PROTECT)
   ```

2. In `apps/trials/models.py`, change `Trial.location`:
   ```python
   # Before:
   location = models.ForeignKey(Location, on_delete=models.CASCADE)
   # After:
   location = models.ForeignKey(Location, on_delete=models.PROTECT)
   ```

3. In `apps/trials/models.py`, change `Trial.season`:
   ```python
   # Before:
   season = models.ForeignKey(Season, on_delete=models.CASCADE)
   # After:
   season = models.ForeignKey(Season, on_delete=models.PROTECT)
   ```

4. Generate and apply migration:
   ```powershell
   cd backend
   .venv\Scripts\python manage.py makemigrations trials
   .venv\Scripts\python manage.py migrate
   ```

5. **Add test** in `apps/trials/tests/test_models.py`:
   ```python
   @pytest.mark.django_db
   def test_deleting_germplasm_with_plots_raises():
       # Create germplasm, trial, plot. Try to delete germplasm.
       # Expect django.db.models.ProtectedError.
       ...
   ```

6. **Verify**: `python -m pytest -q`.

---

### 4.7 Cleanup (30 min)

**Step-by-step implementation:**

1. Delete `backend/flake_remaining.txt`:
   ```powershell
   Remove-Item C:\wheat-breeding-platform\backend\flake_remaining.txt
   ```

2. Remove `coreapi` from `backend/requirements.txt` — delete the line
   `coreapi==2.*`. It is deprecated and unused.

3. Update `backend/Dockerfile` — add `EXPOSE` and `CMD`:
   ```dockerfile
   FROM python:3.12-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   EXPOSE 8000
   CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
   ```

4. **Verify**: `python -m pytest -q` and `docker compose build` (if Docker
   available).

---

## Phase 5: Production Readiness — ✅ COMPLETE

### 5.1 Logging (2 hours)

**Implementation notes for builder:**
- Add `LOGGING` dict to `config/settings.py`.
- Use `"django.server"` and app-level loggers (`"apps.trials"`, etc.).
- JSON format for production, console for development (switch on `DEBUG`).
- Add `logger.info()` calls in `services.py` for plot creation.
- Add `logger.warning()` in permission denials.

### 5.2 Deployment Hardening (2 hours)

**Implementation notes for builder:**
- Install `whitenoise` and add to `requirements.txt`.
- Add `WhiteNoiseMiddleware` after `SecurityMiddleware` in settings.
- Set `STATIC_ROOT = BASE_DIR / "staticfiles"`.
- Add `STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"`.
- Dockerfile already has gunicorn CMD from 4.7.
- Create `docs/deployment.md` with step-by-step production setup.

### 5.3 BrAPI v2 Endpoints (8–16 hours)

**Implementation notes for builder:**
- Create `apps/brapi/` as a new Django app.
- Implement read-only endpoints mapping to BrAPI v2 spec:
  - `/brapi/v2/studies` → Trial
  - `/brapi/v2/germplasm` → Germplasm
  - `/brapi/v2/observations` → Observation
  - `/brapi/v2/observationvariables` → ObservationVariable
- Use separate serializers that match BrAPI JSON schema (camelCase field
  names, BrAPI-specific wrapper format with `metadata` and `result`).
- Reference: https://brapi.org/specification
- Keep internal API (`/api/`) unchanged.

### 5.4 Monitoring & Observability (2 hours, optional)

**Implementation notes for builder:**
- Add a `/api/health/` endpoint (no auth required) that returns DB status.
- Optionally integrate Sentry via `sentry-sdk[django]`.
- Document backup procedure for PostgreSQL (`pg_dump`).

---

## Phase 6: Documentation & Tech-Debt Cleanup — ✅ COMPLETE

### 6.1 Current-State Documentation

- [x] Updated README test baseline and OpenAPI/Swagger/ReDoc links.
- [x] Refreshed the architecture scope, components, model relationships,
  resolved issues, and future opportunities.
- [x] Updated the session handoff and document index.

### 6.2 OpenAPI Documentation

- [x] Documented the schema URL, generated UIs, schema export, and purpose.
- [x] Added explicit drf-spectacular response annotations to
  `BrapiServerInfoViewSet` and `health_check`.
- [x] Verified schema generation has no endpoint-introspection errors.

### 6.3 Architecture Decision Records

- [x] Accepted and documented the database-specific germplasm identifier save
  strategy.
- [x] Confirmed and documented global `ObservationVariable` scope.

### 6.4 Historical Documentation

- [x] Replaced the resolved detailed code-review documents with
  `docs/history.md`.
- [x] Retained the full originals in Git history.

### 6.5 Verification

- [x] Verified 77 passing tests and 1 optional Sentry skip.
- [x] Verified the production environment values that clear Django deployment
  security warnings.

---

## Phase 7: Custom Browser Frontend — ✅ COMPLETE

### Goal

Build a Vite + React + TypeScript SPA that makes the platform usable for daily
breeder workflows without requiring Django Admin or CLI access.

### Stack

- **Vite + React 18 + TypeScript** — SPA served separately from Django.
- **React Query (`@tanstack/react-query`)** — data fetching and caching.
- **Zustand** — persisted auth token and role state.
- **Recharts** — trial summary charts.
- **Vite dev-server proxy** — forwards `/api/` to Django at `:8000`.

### Backend additions

- [x] `GET /api/trials/{id}/export_csv/` — streaming observations CSV download.
- [x] `GET /api/trials/{id}/export_fieldbook/` — streaming Field Book CSV download.
- [x] Tests for both new actions (79 passing, 1 skipped).

### Frontend pages

- [x] Login (token auth form, Zustand persist, redirect on success)
- [x] Dashboard (stat cards, program grid, recent observations table)
- [x] Germplasm Browser (search, cross-type filter, pedigree panel)
- [x] Trial Manager (list, plot grid colored by entry, create-plots button, summary chart)
- [x] Observation Entry (trial → plot → traits form with inline type/range validation)
- [x] Data Export (one-click authenticated CSV and Field Book downloads)

### Infrastructure

- [x] `frontend/Dockerfile` (Node 20 Alpine, Vite dev server)
- [x] `frontend` service added to `docker-compose.yml`

### Phase 7 Complete When

- [x] `npm install && npm run dev` starts successfully (requires Node ≥ 18).
- [x] All five screens render and connect to the Django API.
- [x] Observation entry creates records visible in the API.
- [x] CSV and Field Book exports download from the browser.
- [x] All 79+ backend tests still pass.
- [x] Architecture and NEXT_PHASE_SUMMARY docs updated.

---

## Effort Estimates

| Phase | Estimated Hours | Priority |
|-------|-----------------|----------|
| 4.1 django-filter          | 1–2 h   | High     |
| 4.2 Exception handler      | 1 h     | Medium   |
| 4.3 CSV import/export      | 4–6 h   | High     |
| 4.4 Trial summary stats    | 2 h     | Medium   |
| 4.5 Test consolidation     | 1 h     | Low      |
| 4.6 FK cascade review      | 1 h     | Medium   |
| 4.7 Cleanup                | 0.5 h   | Low      |
| **Phase 4 total**          | **~12 h**| —       |
| Phase 5 (all items)        | ~14–22 h| Later    |

---

## Success Metrics

### Phase 4 Complete When:
- All list endpoints support filtering by FK and choice fields
- Structured error responses on all API errors
- At least one CSV import and one export command working
- No duplicate test coverage
- FK cascade behavior reviewed and updated where needed
- All tests passing

### Phase 5 Complete When:
- Application runs in production mode with gunicorn
- Static files served properly
- Structured logging in place
- BrAPI v2 read-only endpoints functional
- Deployment procedure documented

### Phase 6 Complete When:
- Current-state documentation matches the live code and test baseline
- OpenAPI URLs and generation workflow are documented
- The two schema endpoint-introspection errors are resolved
- Germplasm identifier and trait-scope decisions are recorded as ADRs
- Historical review documents are consolidated
- Tests and deployment security settings are verified

---

## Phase 8: Frontend CRUD Operations — ✅ COMPLETE

### Goal
Make the browser UI fully self-contained for daily breeding workflows by adding create, edit, and delete modals to every main screen, removing the need for Django Admin or CLI access for core operations.

### Backend Additions
- [x] `@extend_schema_field` metadata and Python type hints to eliminate drf-spectacular W001 warnings for `plot_count` and other read-only serializer method fields.

### Shared UI Infrastructure
- [x] Global CSS additions for `.modal` and overlay.
- [x] `Modal.tsx` generic React portal component with Escape-to-close behavior.
- [x] `ConfirmDialog.tsx` reusable component for cascade-aware destructive actions.
- [x] Expanded API Client (`src/api/client.ts`) covering `create`, `update`, and `destroy` for all relevant namespaces.

### Frontend Pages
- [x] **Germplasm Browser:** Added `+ Add Germplasm` button (role-gated), 9-field create/edit form, and inline edit/delete buttons per row.
- [x] **Trial Manager:** Added `+ New Trial` button, dependent season dropdown (filters seasons by program), and inline edit/delete.
- [x] **New `/setup` Page:** Tabbed interface for Programs, Locations, Seasons, and Observation Variables. Each tab has full Create, Edit, and Delete tables.

### Phase 8 Complete When
- [x] Tests continue to pass with 0 regressions.
- [x] drf-spectacular schema validates with 0 errors.
- [x] Forms enforce required fields and constraints.
- [x] Users can perform complete CRUD lifecycle via UI for Programs, Locations, Seasons, Germplasm, Trials, and Observation Variables.

---

## Phase 9: Frontend Depth & Bulk Workflows — ✅ COMPLETE

### Goal

Close the gap between the CLI/Admin power tools and the browser UI so daily
breeder workflows (bulk data entry, multi-trait review, change history) no
longer require dropping back to `manage.py` or Django Admin.

### Prerequisites

- Phases 1–8 complete (verified: 79 passed, 1 skipped).
- `import_germplasm` management command exists at
  `apps/germplasm/management/commands/import_germplasm.py`.

---

### 9.1 CSV Bulk-Import Endpoint + UI (3–4 hours)

**Goal:** Let a breeder upload a germplasm CSV from the browser instead of
running the management command by hand.

**Context:** `import_germplasm` already contains the parsing/validation
logic. Reuse it rather than duplicating parsing in the view.

**Step-by-step implementation:**

1. Refactor the reusable part of the command into a service function in
   `apps/germplasm/services.py` (this file does not exist yet — create it):

```python
import csv
import io

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.core.models import Program
from apps.germplasm.models import Germplasm


def import_germplasm_csv(file_obj, program_name, dry_run=False):
    """Parse and optionally persist germplasm rows from an uploaded CSV.

    Returns a dict: {"created": int, "skipped": int,
                     "errors": [{"row": int, "detail": str}]}
    """
    try:
        program = Program.objects.get(name=program_name)
    except Program.DoesNotExist as exc:
        raise ValidationError(f"Unknown program: {program_name}") from exc

    text_stream = io.TextIOWrapper(file_obj, encoding="utf-8")
    reader = csv.DictReader(text_stream)

    # Header validation — must contain at least "name"
    if not reader.fieldnames or "name" not in reader.fieldnames:
        raise ValidationError(
            f"CSV is missing the required 'name' header. "
            f"Found: {reader.fieldnames}"
        )

    created = 0
    skipped = 0
    errors = []
    with transaction.atomic():
        for i, row in enumerate(reader, start=2):  # header is row 1
            name = row.get("name", "").strip()
            if not name:
                errors.append({"row": i, "detail": "Missing required field: name"})
                continue

            # Skip duplicates within the same program (matches CLI behavior)
            if Germplasm.objects.filter(program=program, name=name).exists():
                skipped += 1
                continue

            try:
                germplasm = Germplasm(
                    name=name,
                    species=row.get("species", "").strip() or "Triticum aestivum",
                    program=program,
                    pedigree_string=row.get("pedigree_string", "").strip(),
                    cross_type=row.get("cross_type", "").strip() or "unknown",
                    year_developed=int(row["year_developed"]) if row.get("year_developed", "").strip() else None,
                    notes=row.get("notes", "").strip(),
                )
                germplasm.full_clean()
                if not dry_run:
                    germplasm.save()
                created += 1
            except (ValidationError, KeyError, ValueError) as exc:
                errors.append({"row": i, "detail": str(exc)})

        if dry_run or errors:
            transaction.set_rollback(True)

    return {
        "created": 0 if (dry_run or errors) else created,
        "skipped": skipped,
        "errors": errors,
    }
```

   **Important:** The field names match the actual `Germplasm` model:
   `pedigree_string` (not `pedigree`), `year_developed` (not
   `development_year`). The service also replicates the CLI command's
   header validation, duplicate-skipping, and default-species logic so
   both entry points behave identically.

2. Update `import_germplasm.py` to call this service instead of
   duplicating logic (keeps CLI and API behavior identical).

3. Add an API endpoint in `apps/germplasm/viewsets.py`:

```python
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

class GermplasmViewSet(viewsets.ModelViewSet):
    ...

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser],
        url_path="bulk_import",
    )
    def bulk_import(self, request):
        file_obj = request.FILES.get("file")
        program_name = request.data.get("program")
        dry_run = request.data.get("dry_run") in ("true", "True", "1")

        if not file_obj or not program_name:
            return Response(
                {"errors": [{"row": 0, "detail": "file and program are required"}]},
                status=400,
            )

        result = import_germplasm_csv(file_obj.file, program_name, dry_run=dry_run)
        status_code = 201 if not result["errors"] else 400
        return Response(result, status=status_code)
```

   Route: `POST /api/germplasm/bulk_import/`. Gate write access with the
   existing `RoleBasedPermission` (breeder/admin only — override
   `get_permissions` for this action if the default already covers writes,
   no change needed).

4. **Frontend** — `frontend/src/pages/GermplasmBrowser.tsx`:
   - Add a "Bulk Import" button next to "+ Add Germplasm" (role-gated the
     same way).
   - New modal: file input (`.csv`), program dropdown (reuse the existing
     program list from React Query), a "Validate only" checkbox mapped to
     `dry_run`.
   - On submit, `POST` via `FormData` to `/api/germplasm/bulk_import/`.
     Add a `bulkImportGermplasm` function in `client.ts`.
     **Important:** The existing `apiFetch` helper hard-codes
     `Content-Type: application/json` which breaks `FormData` uploads.
     The new function must use raw `fetch` (not `apiFetch`) so the
     browser can auto-set `Content-Type: multipart/form-data` with the
     correct boundary. Copy the auth-token logic from `apiFetch`.
   - Render `created` count, `skipped` count, and a table of `errors`
     (row + detail) in the modal on response; keep the modal open on
     error so the user can fix and re-upload.

5. **Tests to add** (`backend/tests/test_api_germplasm_bulk_import.py`):
   - Valid CSV with 3 rows → `created: 3`, 201.
   - CSV with one bad row (missing `name`) → 400, `errors` has one entry,
     zero rows persisted (whole-file rollback).
   - `dry_run=true` on a valid CSV → 200/201 with `created: 0` reported but
     no rows actually persisted (assert `Germplasm.objects.count()`
     unchanged).
   - Viewer role → 403.

6. **Verify**:
   ```powershell
   cd backend
   .\.venv\Scripts\python -m pytest -q
   cd ..\frontend
   npx tsc --noEmit
   ```

---

### 9.2 Bulk Observation Entry Grid (4–5 hours)

**Goal:** Replace one-plot-at-a-time observation entry with a spreadsheet
grid: rows = plots, columns = trial's observation variables.

**Context:** `Observation` already validates type/range in `full_clean()`.
The existing `POST /api/observations/` endpoint is unchanged; this phase
adds a bulk-create action plus a grid UI.

**Step-by-step implementation:**

1. Add a bulk-create action in `apps/trials/viewsets.py`:

```python
from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response

class ObservationViewSet(viewsets.ModelViewSet):
    ...

    @action(detail=False, methods=["post"], url_path="bulk_create")
    def bulk_create(self, request):
        rows = request.data.get("observations", [])
        created = []
        errors = []

        with transaction.atomic():
            for i, row in enumerate(rows):
                serializer = self.get_serializer(data=row)
                if serializer.is_valid():
                    try:
                        serializer.save()
                        created.append(serializer.data)
                    except (ValidationError, DjangoValidationError) as exc:
                        # Observation.save() calls full_clean() which may
                        # raise model-level errors (range, type, etc.)
                        detail = exc.message_dict if hasattr(exc, "message_dict") else str(exc)
                        errors.append({"index": i, "detail": detail})
                else:
                    errors.append({"index": i, "detail": serializer.errors})

            if errors:
                transaction.set_rollback(True)

        status_code = 201 if not errors else 400
        return Response({"created": created if not errors else [], "errors": errors}, status=status_code)
```

   Route: `POST /api/observations/bulk_create/`, body:
   `{"observations": [{"plot": 1, "variable": 2, "value_numeric": 3.4}, ...]}`.
   Whole-batch rollback matches the 9.1 import behavior for consistency.

   **Note:** Import `ValidationError` from `rest_framework.exceptions` and
   `ValidationError as DjangoValidationError` from `django.core.exceptions`
   at the top of the file. The try/except around `serializer.save()` is
   necessary because `Observation.save()` calls `self.full_clean()`, which
   enforces model-level constraints (numeric range, data type) that the
   serializer alone does not check.

2. **Frontend** — new component `frontend/src/components/ObservationGrid.tsx`:
   - Fetch the trial's plots (`GET /api/plots/?trial={id}`) and the trial's
     observation variables (reuse the existing variable list, filtered to
     ones relevant to the trial if that concept exists, otherwise show all).
   - Render an editable HTML table: rows = plots (sorted by rep/block/
     position), columns = variables. Each cell is a typed input matching
     the variable's `data_type` (numeric input, text input, or a
     restricted select if the variable defines categories).
   - Track dirty cells in local component state; a "Save All" button
     collects only changed cells into the `observations` payload and posts
     to `bulk_create`.
   - On validation errors, highlight the offending cells inline using the
     `index` in the error response mapped back to (plot, variable).

3. Update `frontend/src/pages/ObservationEntry.tsx` to offer a toggle
   between "Single Entry" (existing form) and "Grid Entry" (new
   `ObservationGrid`), both scoped to a selected trial.

4. **Tests to add** (`backend/tests/test_api_observations_bulk.py`):
   - 5 valid rows across 2 plots/3 variables → 201, 5 created.
   - One invalid row (out-of-range value) → 400, no rows persisted.
   - Technician role → allowed (matches existing observation-write rule).
   - Viewer role → 403.

5. **Verify**: same as 9.1.

---

### 9.3 Multi-Trait Trial Summary View (2–3 hours)

**Goal:** Extend the existing single-variable summary chart into a
per-trait comparison view.

**Step-by-step implementation:**

1. **No backend changes needed.** `compute_trial_summary` in
   `apps/trials/services.py` already accepts only a `trial` parameter and
   returns a `list[dict]` containing stats for *all* variables with numeric
   observations in that trial. The summary viewset action at
   `GET /api/trials/{id}/summary/` calls it and returns
   `{"trial": "...", "summary": [...]}`.

2. Frontend — `frontend/src/pages/TrialManager.tsx`:
   - Add a "Compare Traits" panel using Recharts `BarChart` (mean per
     variable, one bar per variable) and a small stats table (count,
     mean, min, max, std dev, CV per variable) below the existing plot
     grid.
   - Use the existing `trials.summary(id)` client function which already
     returns the full multi-variable response. No new backend route or
     query parameter is needed.

3. **Tests to add**: extend `backend/tests/test_api_trials.py` — add a
   confirmation test that the summary endpoint returns stats for *all*
   trial variables (not just one) when multiple variables have observations.
   This validates the existing behavior rather than testing new code.

4. **Verify**: same as 9.1.

---

### 9.4 Audit Trail (`created_by` / `updated_by`) (2 hours)

**Goal:** Track who created/modified core records, surfaced in the Setup
page — no separate audit-log model, just attribution fields plus existing
`created_at`/`updated_at`.

**Step-by-step implementation:**

1. Add nullable FK fields to `Program`, `Location`, `Season`, `Germplasm`,
   `Trial`, `ObservationVariable` (skip high-volume models like
   `Observation`/`Plot` to avoid write overhead on bulk operations):

```python
created_by = models.ForeignKey(
    settings.AUTH_USER_MODEL, null=True, blank=True,
    on_delete=models.SET_NULL, related_name="+",
)
updated_by = models.ForeignKey(
    settings.AUTH_USER_MODEL, null=True, blank=True,
    on_delete=models.SET_NULL, related_name="+",
)
```

   **Missing timestamp fields:** `Location` currently has no `created_at`
   or `updated_at` fields, and `ObservationVariable` has `created_at` but
   no `updated_at`. Add these in the same migration:

   - `Location`: add `created_at = models.DateTimeField(auto_now_add=True)`
     and `updated_at = models.DateTimeField(auto_now=True)`.
   - `ObservationVariable`: add `updated_at = models.DateTimeField(auto_now=True)`.

   Generate and run migrations for each affected app (`core`, `germplasm`,
   `trials`).

   The viewsets that need `perform_create`/`perform_update` overrides are
   in three files:
   - `apps/core/viewsets.py` — `ProgramViewSet`, `LocationViewSet`,
     `SeasonViewSet`
   - `apps/germplasm/viewsets.py` — `GermplasmViewSet`
   - `apps/trials/viewsets.py` — `TrialViewSet`,
     `ObservationVariableViewSet`

2. Set these fields in the relevant viewsets by overriding
   `perform_create`/`perform_update`:

```python
def perform_create(self, serializer):
    serializer.save(created_by=self.request.user, updated_by=self.request.user)

def perform_update(self, serializer):
    serializer.save(updated_by=self.request.user)
```

3. Expose `created_by_username` / `updated_by_username` as read-only
   `SerializerMethodField`s (with `@extend_schema_field(str)` to keep
   drf-spectacular clean, matching the Phase 8 pattern for `plot_count`).

4. Frontend — Setup page tables: add "Created by" / "Last updated by"
   columns (username + relative `updated_at` timestamp) to each tab's
   table.

5. **Tests to add**: for one representative model (e.g. `Trial`), assert
   `created_by`/`updated_by` are set correctly on create and update, and
   `null` when created via a management command (no request user).

6. **Verify**: same as 9.1, plus:
   ```powershell
   .\.venv\Scripts\python manage.py spectacular --file openapi.yaml --validate
   ```

---

### Phase 9 Complete When

- [x] Germplasm CSV bulk-import works from the browser with validation
      errors surfaced per-row.
- [x] Observation grid entry supports multi-plot, multi-variable save in
      one request, with per-cell error highlighting.
- [x] Trial Manager shows a multi-trait comparison chart alongside the
      existing plot grid.
- [x] Core models show created/updated-by attribution in the Setup page.
- [x] All existing tests plus new Phase 9 tests pass (baseline: 90 passed, 1 skipped).
- [x] `openapi.yaml` regenerates with 0 errors.
- [x] `architecture.md` and `NEXT_PHASE_SUMMARY.md` updated to reflect
      Phase 9 completion.

### Effort Estimate

| Section | Estimated Hours |
|---|---:|
| 9.1 Bulk germplasm import | 3–4 h |
| 9.2 Bulk observation grid | 4–5 h |
| 9.3 Multi-trait summary | 2–3 h |
| 9.4 Audit trail | 2 h |
| **Phase 9 total** | **~12–14 h** |

---

## Phase 10: Alpha-Lattice & Augmented Trial Designs — ✅ COMPLETE

### Goal

RCBD works well for small trials with few replications, but breaks down
once entry counts grow large enough that complete blocks can't reasonably
contain every entry. Add two additional layout-generation strategies —
**alpha-lattice** (incomplete blocks, replicated entries) and
**augmented** (checks replicated, test entries unreplicated) — alongside
the existing RCBD generator, selectable at trial creation.

### Prerequisites

- Phases 1–9 complete.
- `generate_rcbd_layout` and `create_plots_for_trial` in
  `apps/trials/services.py` are the reference implementation to extend
  around, not replace.

---

### 10.1 Data Model Changes
- [x] Extend `design_type` choices in `apps/trials/models.py` to support `alpha_lattice` and `augmented`
- [x] Add `block_size` field to `Trial` model (nullable, optional)
- [x] Add `incomplete_block` (nullable integer) and `is_check` (boolean) fields to `Plot` model
- [x] Implement model validation in `Trial.clean()` for `block_size` presence when `design_type == "alpha_lattice"`
- [x] Generate and apply database migrations for `trials`
- [x] Add unit tests in `apps/trials/tests/test_models.py` for model-level validations and fields

### 10.2 Alpha-Lattice Layout Service
- [x] Add `generate_alpha_lattice_layout` in `apps/trials/services.py` that takes entries, reps, block_size, and seed
- [x] Validate entry count is divisible by block size, and block_size >= 2
- [x] Refactor `create_plots_for_trial` in `apps/trials/services.py` to branch on `design_type` for RCBD, alpha_lattice, and augmented
- [x] Ensure layout generators accept `Sequence[Germplasm]` or use ID/index mappings correctly
- [x] Add unit tests in `apps/trials/tests/test_services.py` for alpha-lattice generation (divisibility check, correct blocks, determinism)

### 10.3 Augmented Design Service
- [x] Add `generate_augmented_layout` in `apps/trials/services.py` that distributes test entries across replicates and replicates checks in every rep
- [x] Update `create_plots_for_trial` to accept `check_germplasm_ids` parameter and pass it to `generate_augmented_layout`
- [x] Add unit tests in `apps/trials/tests/test_services.py` for augmented design generation (check replication count, test entry count, empty check edge case, determinism)

### 10.4 API & Frontend Design Selection
- [x] Update `TrialSerializer` to expose `block_size` and validate `block_size` requirement for alpha_lattice
- [x] Update `PlotSerializer` to expose `incomplete_block` and `is_check`
- [x] Update `create_plots` action in `TrialViewSet` to accept `check_germplasm_ids` and pass them to `create_plots_for_trial`
- [x] Update TypeScript API client interfaces in `frontend/src/api/client.ts` (`Trial`, `Plot`) to include new fields
- [x] Update Trial Manager creation form in `frontend/src/pages/TrialManager.tsx` to support alpha-lattice (conditional block size input) and augmented (entry check flags)
- [x] Update `PlotGrid` component/styles in `frontend/src/pages/TrialManager.tsx` to visually group/label incomplete blocks and highlight check plots
- [x] Add API integration tests in `backend/tests/test_api_trials.py` for both layout creation endpoints

---

### Phase 10 Complete When

- [x] Alpha-lattice layouts generate correctly for divisible entry/block-size combinations and reject non-divisible ones with a clear error.
- [x] Augmented layouts replicate checks per-replicate and place each test entry exactly once.
- [x] Trial creation form supports selecting a design type with the correct conditional inputs (block size / check flags).
- [x] Plot grid visually differentiates incomplete blocks and check plots.
- [x] All existing tests plus new Phase 10 tests pass.
- [x] `openapi.yaml` regenerates with 0 errors.
- [x] `architecture.md` and `NEXT_PHASE_SUMMARY.md` updated.

### Effort Estimate

| Section | Estimated Hours |
|---|---:|
| 10.1 Data model changes | 1–2 h |
| 10.2 Alpha-lattice service | 3–4 h |
| 10.3 Augmented design service | 2–3 h |
| 10.4 API & frontend design selection | 2–3 h |
| **Phase 10 total** | **~8–12 h** |

---

## Phase 11: BrAPI v2 Write Support

### Goal

`apps.brapi` is currently read-only (§4.2 of `architecture.md`). Add
write operations for the resources where write access has real value —
observations, observation units (plots), and germplasm — so external
BrAPI clients (Field Book, BreedBase, other breeding tools) can push data
into the platform, not just read from it. Internal RBAC continues to
govern who can write; BrAPI write endpoints are a transition layer, not
a bypass of it.

### Prerequisites

- Phases 1–10 complete.
- Existing BrAPI read serializers/routes in `apps/brapi/` are the pattern
  to extend — camelCase translation, `BrapiPagination` envelope, and the
  project's default authentication requirement all carry over unchanged.

### Scope Decisions

- **In scope:** `POST`/`PUT` for `observations`, `POST`/`PUT` for
  `observationunits` (maps to internal `Plot` status field, not
  layout — plot creation stays an internal-API-only RCBD/lattice/augmented
  operation), and `POST` for `germplasm`.
- **Out of scope for this phase:** BrAPI `studies`/`trials` write
  (trial creation has internal-only preconditions — program, location,
  season FKs — that don't map cleanly onto the BrAPI study payload without
  a lot of translation risk). Revisit if a concrete client needs it.
- **Auth model:** BrAPI write requests authenticate exactly like internal
  API requests (token auth), and go through the same `RoleBasedPermission`
  role checks as their internal-API equivalents. A BrAPI client is just
  another authenticated caller — no separate BrAPI-specific permission
  tier.

---

### 11.1 BrAPI Observation Write (3–4 hours)

**Goal:** `POST /brapi/v2/observations` and
`PUT /brapi/v2/observations/{id}` accept BrAPI-shaped observation payloads
and translate them into internal `Observation` create/update.

**Context:** The existing read serializer
(`apps/brapi/serializers.py::ObservationSerializer`, or equivalent) already
knows the camelCase↔internal field mapping for reads. Reuse the same field
mapping table for the reverse direction rather than hand-writing a new
translation.

**Step-by-step implementation:**

1. Add a writeable BrAPI serializer in `apps/brapi/serializers.py`:

```python
class ObservationWriteSerializer(serializers.Serializer):
    observationUnitDbId = serializers.IntegerField(source="plot_id")
    observationVariableDbId = serializers.IntegerField(source="variable_id")
    value = serializers.CharField()
    observationTimeStamp = serializers.DateTimeField(
        source="observation_time", required=False
    )

    def validate(self, attrs):
        # Route `value` into the correct typed field based on the
        # variable's data_type, reusing Observation's own validation.
        variable = ObservationVariable.objects.filter(
            id=attrs["variable_id"]
        ).first()
        if variable is None:
            raise serializers.ValidationError(
                {"observationVariableDbId": "Unknown variable."}
            )
        attrs["_variable"] = variable
        return attrs

    def create(self, validated_data):
        variable = validated_data.pop("_variable")
        obs = Observation(
            plot_id=validated_data["plot_id"],
            variable=variable,
            observation_time=validated_data.get("observation_time"),
        )
        obs.set_typed_value(validated_data["value"])  # see step 2
        obs.full_clean()
        obs.save()
        return obs

    def update(self, instance, validated_data):
        if "value" in validated_data:
            instance.set_typed_value(validated_data["value"])
        if "observation_time" in validated_data:
            instance.observation_time = validated_data["observation_time"]
        instance.full_clean()
        instance.save()
        return instance
```

2. Add a `set_typed_value(self, raw_value)` helper method on the
   `Observation` model in `apps/trials/models.py` if one doesn't already
   exist — it should route a raw string into `value_numeric`,
   `value_text`, or `value_boolean` based on `self.variable.data_type`,
   reusing whatever type-coercion logic `full_clean()` already validates
   against. This keeps BrAPI writes and internal-API writes sharing one
   code path for "what does this string mean for this variable."

3. Add BrAPI write views in `apps/brapi/views.py`:

```python
class BrapiObservationViewSet(mixins.CreateModelMixin,
                                mixins.UpdateModelMixin,
                                GenericViewSet):
    queryset = Observation.objects.all()
    serializer_class = ObservationWriteSerializer
    permission_classes = [RoleBasedPermission]  # same as internal Observation writes
```

   Wire into `apps/brapi/urls.py` as `observations` `POST`/`PUT` alongside
   the existing read-only `ListAPIView`/`RetrieveAPIView` for the same
   path.

4. Response shape: BrAPI expects the created/updated resource echoed back
   in BrAPI shape (reuse the existing read `ObservationSerializer` for the
   response body, not the write serializer, so camelCase output matches
   what a BrAPI client already expects from `GET`).

5. **Tests to add** (`backend/tests/test_brapi_write.py`):
   - Valid observation create → 201, response uses BrAPI camelCase field
     names, `Observation.objects.count()` incremented.
   - Invalid variable ID → 400 with BrAPI-appropriate error shape.
   - Out-of-range numeric value for the variable → 400.
   - Viewer-role token → 403.
   - Technician-role token → 201.

---

### 11.2 BrAPI Observation Unit (Plot) Write (2–3 hours)

**Goal:** `PUT /brapi/v2/observationunits/{id}` allows updating plot
**status** only — not layout fields (replication, block, position, germplasm),
which stay internal-API-only since they're governed by the design-generation
services.

**Step-by-step implementation:**

1. Add `ObservationUnitWriteSerializer` in `apps/brapi/serializers.py`,
   mapping only the mutable status field:

```python
class ObservationUnitWriteSerializer(serializers.Serializer):
    observationUnitPUI = serializers.CharField(required=False)
    observationUnitPosition = serializers.DictField(required=False)

    def validate(self, attrs):
        if "observationUnitPosition" in attrs:
            raise serializers.ValidationError(
                "Plot layout (position/block/replication) cannot be "
                "modified via BrAPI. Update status only, or use "
                "the internal API for layout changes."
            )
        return attrs
```

2. `PUT` view following the same pattern as 11.1, scoped to `Plot`.

3. **Tests to add**:
   - Update `status` → 200, internal `Plot` row updated.
   - Attempt to update `observationUnitPosition` → 400, plot unchanged.
   - RBAC: matches internal `Plot` update role.

---

### 11.3 BrAPI Germplasm Write (2–3 hours)

**Goal:** `POST /brapi/v2/germplasm` creates internal `Germplasm` records
from BrAPI-shaped payloads.

**Step-by-step implementation:**

1. Add `GermplasmWriteSerializer`, translating BrAPI germplasm fields
   (`germplasmName`, `commonCropName`, `pedigree`, etc.) to internal
   `Germplasm` fields. Reuse the internal `GermplasmSerializer`'s
   validation.

2. `POST` view, `RoleBasedPermission` scoped to the same roles as internal
   `Germplasm` creation.

3. **Tests to add**:
   - Valid BrAPI germplasm payload → 201, internal `Germplasm` created.
   - Duplicate `germplasmName`/`germplasm_db_id` → 400.
   - Unknown `programDbId` → 400.

---

### 11.4 Documentation & Schema (1–2 hours)

**Goal:** Keep OpenAPI schema, BrAPI compatibility notes, and
architecture docs in sync with the new write surface.

**Step-by-step implementation:**

1. Confirm `drf-spectacular` picks up the new write viewsets cleanly.
2. Update `architecture.md`:
   - §1.3 "Out of Scope" — remove "BrAPI write operations."
   - §4.2 — document writeable BrAPI resources.
   - §10.3 — remove "BrAPI write support" from opportunities.
3. Update `NEXT_PHASE_SUMMARY.md`.

---

### Phase 11 Complete When

- [x] `POST`/`PUT /brapi/v2/observations` create/update observations with the same validation/RBAC.
- [x] `PUT /brapi/v2/observationunits/{id}` updates status only; layout changes are rejected.
- [x] `POST /brapi/v2/germplasm` creates germplasm.
- [x] All existing tests plus new Phase 11 tests pass.
- [x] `openapi.yaml` regenerates with 0 errors.

### Effort Estimate

| Section | Estimated Hours |
|---|---:|
| 11.1 BrAPI observation write | 3–4 h |
| 11.2 BrAPI observation unit write | 2–3 h |
| 11.3 BrAPI germplasm write | 2–3 h |
| 11.4 Documentation & schema | 1–2 h |
| **Phase 11 total** | **~8–12 h** |

---

## Phase 12: Observability & Ops Hardening

### Goal

The platform already has structured JSON logging and an optional Sentry
hook (§5 of `deployment.md`), but there's no metrics surface, no
in-app visibility into who changed what (beyond the raw `created_by`/
`updated_by` fields added in Phase 9), and no automated proof that backups
are actually restorable. This phase closes those three gaps without
introducing new infrastructure dependencies beyond what's already optional
(Redis is already supported; Prometheus scraping needs no new service,
just an endpoint).

### Prerequisites

- Phases 1–9 complete (Phase 9's `created_by`/`updated_by` fields are the
  data source for 12.2's audit log page — this phase does not duplicate
  that with a separate audit table).
- Phases 10–11 are independent of this phase and can land in either order.

---

### 12.1 Metrics Endpoint (2–3 hours)

**Goal:** Expose request-level and domain-level metrics in Prometheus
text format at `/api/metrics/`, gated the same way `/api/health/` is
(public, but read-only and free of sensitive data).

**Step-by-step implementation:**

1. Add `django-prometheus` to `backend/requirements/base.txt`.

2. Add to `INSTALLED_APPS` and `MIDDLEWARE` in `config/settings.py`:

```python
INSTALLED_APPS = [
    "django_prometheus",
    ...
]

MIDDLEWARE = [
    "django_prometheus.middleware.PrometheusBeforeMiddleware",
    ...,
    "django_prometheus.middleware.PrometheusAfterMiddleware",
]
```

3. Add the metrics URL in `config/urls.py`:

```python
urlpatterns = [
    path("api/metrics/", include("django_prometheus.urls")),
    ...
]
```

4. Add a small set of **domain-specific** gauges in `apps/core/metrics.py`:

```python
from prometheus_client import Gauge

from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, Trial

germplasm_total = Gauge("wbp_germplasm_total", "Total germplasm records")
trials_active_total = Gauge("wbp_trials_active_total", "Trials with an end date in the future or unset")
observations_total = Gauge("wbp_observations_total", "Total observations recorded")


def refresh_domain_gauges():
    germplasm_total.set(Germplasm.objects.count())
    trials_active_total.set(Trial.objects.filter(end_date__gte=timezone.now()).count())
    observations_total.set(Observation.objects.count())
```

5. Call `refresh_domain_gauges()` on each scrape. Hook it into a custom view that calls the refresh function then delegates to the django-prometheus exporter.

6. Document the endpoint in `deployment.md` §5 (Logging & Monitoring).

7. **Tests to add** (`backend/tests/test_metrics.py`):
   - `GET /api/metrics/` returns 200 with Prometheus text format, unauthenticated.
   - Response body contains `wbp_germplasm_total` and reflects the actual count.

---

### 12.2 Audit Log Page (Admin/Setup UI) (2–3 hours)

**Goal:** Surface the `created_by`/`updated_by`/timestamp fields added in
Phase 9 as a browsable, filterable change history in the Setup page,
rather than requiring Django Admin access to see who changed what.

**Step-by-step implementation:**

1. Add a lightweight read-only API endpoint, `GET /api/audit/recent_changes/`, in `apps/core/views.py` pulling recently updated records from `Program`, `Location`, `Season`, `Germplasm`, `Trial`, and `ObservationVariable` using `created_by` / `updated_by` and sorted by `updated_at` descending.

2. Restrict this view to admin role.

3. **Frontend** — new tab in `frontend/src/pages/Setup.tsx` (or a new page if `Setup.tsx` is already large): "Recent Changes" table — columns: model, record label, created by/at, updated by/at. Sortable by `updated_at` descending by default. Role-gate the nav entry to admin only.

4. **Tests to add** (`backend/tests/test_api_audit.py`):
   - Admin token → 200, response includes recently created/updated records across multiple model types, sorted by `updated_at` desc.
   - Non-admin token (breeder/technician/viewer) → 403.
   - `limit` param respected.

---

### 12.3 Automated Backup Restore Verification (2–3 hours)

**Goal:** Prove — automatically, on a schedule — that `backup_db.sh`
output is actually restorable.

**Step-by-step implementation:**

1. Add a new script, `scripts/verify_backup.sh`, that:
   - Takes the most recent `.sql.gz` file from `BACKUP_DIR`.
   - Spins up a throwaway Postgres database.
   - Restores the backup.
   - Runs a sanity query (row count on a core table, e.g. `SELECT COUNT(*) FROM germplasm_germplasm;`).
   - Drops the throwaway database.
   - Exits non-zero on failure.

2. Record the row count alongside each backup in `backup_db.sh` itself.

3. Add a cron example to `deployment.md` §6.

4. **Tests to add:** Add a short "Verifying backups" section to `deployment.md` with manual run instructions and expected output.

---

### Phase 12 Complete When

- [ ] `/api/metrics/` exposes Prometheus-format HTTP and domain metrics, publicly accessible.
- [ ] Admins can view a cross-model "recent changes" list in the Setup UI, built from Phase 9's attribution fields.
- [ ] `scripts/verify_backup.sh` restores the latest backup into a throwaway database and validates row counts.
- [ ] `deployment.md` documents the metrics endpoint and backup verification workflow.
- [ ] All existing tests plus new Phase 12 tests pass.
- [ ] `openapi.yaml` regenerates with 0 errors.
- [ ] `architecture.md` and `NEXT_PHASE_SUMMARY.md` updated.

### Effort Estimate

| Section | Estimated Hours |
|---|---:|
| 12.1 Metrics endpoint | 2–3 h |
| 12.2 Audit log page | 2–3 h |
| 12.3 Backup restore verification | 2–3 h |
| **Phase 12 total** | **~6–9 h** |
