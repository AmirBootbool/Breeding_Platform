# Implementation Roadmap

Updated: 2026-07-03

This roadmap contains detailed implementation instructions for each task.
Each section is self-contained: a builder model can read any single section
and implement it without reading the others.

---

## Phase Summary

| Phase | Status   | Description                       |
|-------|----------|-----------------------------------|
| 1     | ✅ Done  | Security hardening                |
| 2     | ✅ Done  | REST API implementation           |
| 3     | ✅ Done  | Database optimization             |
| 4     | ✅ Done  | Feature completeness & quality    |
| 5     | ✅ Done  | Production readiness              |


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
