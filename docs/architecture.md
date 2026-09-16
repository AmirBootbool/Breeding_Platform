# Wheat Breeding Platform — Architecture & Engineering Reference

Last updated: 2026-09-16

## 1. Project Overview

### 1.1 Goal

A lean, self-hosted platform for managing a wheat breeding program's core
data: germplasm and pedigrees, crossing blocks and seed inventory, field
trials and plot layouts, phenotypic observations, and genomic/marker data.
It exposes role-controlled internal APIs, a BrAPI v2 compatibility API, and
a Django Admin back office.

For feature-level, non-technical documentation aimed at breeders,
technicians, and genomics staff, see [docs/WIKI.md](WIKI.md) and its 11
chapters — this document is the technical reference (data model,
endpoints, RBAC) and does not duplicate that content.

### 1.2 Current Scope

The following capabilities are implemented:

- Germplasm registry with self-referencing pedigree links, generation
  tracking ($F_0$–$F_8+$), check-line flags, and JSON tags.
- Crossing blocks with a planned → pollinated → harvested/failed lifecycle,
  diallel pairing/reciprocal generation, and automatic F1 germplasm + seed
  lot creation on harvest.
- Seed inventory: gram-level lot tracking, reserved-vs-available quantity,
  an immutable transaction ledger, lot splitting, and barcode/QR label
  generation.
- Trial creation and plot-layout generation for RCBD, Alpha-lattice,
  Augmented, P-Rep, Latin Square, and Unreplicated trial designs, plus an
  interactive Map Wizard and Plot Editor for manual layout correction.
- Bulk CSV/Excel (`.xlsx`) germplasm import via browser UI, API, and
  management command, sharing one spreadsheet-parsing implementation
  (`apps.core.spreadsheet`, Phase 22).
- Plot lifecycle tracking and data-type-aware (including categorical)
  phenotypic observations, grouped by reusable Trait Panels.
- Bulk observation grid with whole-batch rollback in spreadsheet view, plus
  an offline-first PWA field-scoring mode (IndexedDB caching, batch Sync
  Center) for zero-connectivity data capture.
- Spatial field heatmaps rendering live trait values over the plot grid.
- Per-trial numeric summary statistics and multi-trait comparison dashboard.
- created_by/updated_by audit attribution on core models, surfaced as an
  in-app "Recent Changes" audit trail.
- CSV/Excel trial-data export and Field Book import/export (`?output_format=xlsx`
  on every trial/GEBV/crossing-map export action; the CSV path stays
  streaming, Excel export is buffered — Phase 22).
- Genomic Selection (GBLUP): VCF/HapMap/dosage-matrix genotype ingestion
  with QC/imputation, a VanRaden G-matrix, and a Henderson mixed-model
  solver producing GEBVs with cross-validation accuracy and per-line
  reliability for trained and candidate lines alike.
- Marker-Assisted Selection (MAS): a diagnostic functional-marker library
  and per-accession allele calls, with a trait-stacking analysis view.
- Token and session authentication with admin, breeder, technician, and viewer roles.
- Full internal REST API with searching, ordering, field filtering, structured error responses, and throttling.
- BrAPI v2 compatibility endpoints (with write support for germplasm, observations, and plot status).
- OpenAPI 3 schema generation through drf-spectacular, with Swagger UI and ReDoc views.
- Django Admin, Prometheus metrics logging, Recent Changes audit UI, production logging, WhiteNoise, Gunicorn, health checks, Redis caching, Sentry integration, and automated backup restore verification.
- Production Docker Compose behind an Nginx reverse proxy, plus a
  Playwright end-to-end browser test suite.
- SQLite development and PostgreSQL production database paths.
- Broad-sense heritability ($H^2$) mixed linear models and cross-environment line ranking.
- Multi-tenant program scoping (`ProgramScopedQuerySetMixin`) enforced
  across core, germplasm, trials, genomics, and BrAPI viewsets, plus
  hardening against malformed query params/payloads (Phase 21).
- **288 tests** (287 passed, 1 skipped) — see §9.

### 1.3 Out of Scope

- Drone or image-based phenotyping.
- Multi-institution data federation.

Genomic data storage and analysis, and spreadsheet formats beyond CSV,
previously listed here as deferred, are no longer out of scope — see §1.2
and Phases 19 and 22 of [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md).

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
| `apps.core` | Programs, locations, seasons, profiles, RBAC, program-scoping mixin, shared CSV/XLSX spreadsheet utilities |
| `apps.germplasm` | Germplasm, pedigrees, crossing blocks, crosses, seed inventory, CSV/Excel import |
| `apps.trials` | Trials, plots, observations, trait panels, statistics, and Field Book workflows |
| `apps.genomics` | Genotype datasets, GBLUP genomic prediction, GEBVs, diagnostic markers/MAS |
| `apps.brapi` | BrAPI v2 compatibility serializers, pagination, routes, and views |
| drf-spectacular | OpenAPI 3 schema, Swagger UI, and ReDoc |
| django-filter | Field-level query-parameter filtering |
| SQLite / PostgreSQL 16 | Development / production persistence |
| WhiteNoise / Gunicorn | Production static files / WSGI serving |
| LocMem / Redis | Development / optional production caching |
| pytest + pytest-django | Unit and integration tests |
| Playwright | End-to-end browser test suite |
| black, isort, flake8 | Formatting and linting |
| python-decouple | Environment configuration |
| pandas / numpy / statsmodels | Phenotypic data processing, heritability modeling, and GBLUP linear algebra |
| openpyxl | `.xlsx` read/write (`apps.core.spreadsheet`) |
| **Vite + React 18 + TypeScript** | **Custom browser frontend SPA** |
| **React Query + Zustand + Recharts** | **Frontend data, state, and charts** |
| **Service worker + IndexedDB** | **Offline-first PWA field scoring and sync** |
| Nginx | Production reverse proxy (`docker-compose.prod.yml`) |

The platform is designed to run locally on a laptop without a GPU.

## 3. Data Model

### 3.1 Relationships

```text
Program 1:N Season
Program 1:N Germplasm
Program 1:N Trial
Program 1:N UserProfile
Program 1:N CrossingBlock, SeedLot, GenotypeDataset, GenomicPrediction, DiagnosticMarker(nullable = global)
Location 1:N Trial
Location 1:N Cross, CrossingBlock
Season 1:N Trial, CrossingBlock
User 1:1 UserProfile

Germplasm self-FK parent_female / parent_male (SET_NULL)
Germplasm 1:N Cross as female or male parent (PROTECT)
Germplasm 1:N Plot (PROTECT)
Germplasm 1:N SeedLot (PROTECT), GenotypeSample (SET_NULL), GenomicBreedingValue (CASCADE), MarkerScore (CASCADE)

CrossingBlock 1:N Cross (SET_NULL)
Cross 1:1 progeny -> Germplasm (SET_NULL, auto-created on harvest)
Plot 1:N SeedLot as source_plot (SET_NULL)
SeedLot 1:N SeedTransaction

Trial 1:N Plot (CASCADE)
Plot 1:N Observation (CASCADE)
ObservationVariable 1:N Observation (PROTECT)
ObservationVariable 1:N GenomicPrediction as trait (CASCADE)
AnalysisSet N:N Trial; AnalysisSet 1:N GenomicPrediction as training_analysis_set (SET_NULL)

GenotypeDataset 1:N GenotypeSample (CASCADE), GenomicPrediction (PROTECT)
GenomicPrediction 1:N GenomicBreedingValue (PROTECT)
DiagnosticMarker 1:N MarkerScore (CASCADE)
```

### 3.2 Core Models

- `Program`: unique name, crop, description, creation timestamp, and `created_by`/`updated_by` fields.
- `Location`: indexed name, coordinates, country, region, timestamps, and `created_by`/`updated_by` fields.
- `Season`: name, indexed year, program (unique within `(name, program, year)`), and `created_by`/`updated_by` fields.
- `UserProfile`: one-to-one user, role, optional program, and timestamps.
- `apps.core.mixins.ProgramScopedQuerySetMixin` (Phase 21): a viewset mixin
  restricting queryset reads and creates to the requesting user's program;
  platform staff/superusers bypass it.

### 3.3 Germplasm Models

- `Germplasm`: name, unique `germplasm_db_id`, species, program, optional parents, pedigree text, cross type, generation index ($F_0$–$F_8+$), `is_check`, JSON `tags`, development year, notes, timestamps, and `created_by`/`updated_by` fields.
- `CrossingBlock`: name, program, optional location/season, sowing map pattern (`male_first`/`female_first`/`alternating`), `include_reciprocals`, notes, timestamps, and `created_by`.
- `Cross`: unique cross code, protected female and male parents, optional `crossing_block`, lifecycle `status` (planned/pollinated/harvested/failed), optional `progeny` (auto-set on harvest), `is_reciprocal`, `map_position`, date, optional location, notes, and timestamps. Model validation prevents a record from using the same parent on both sides.
- `SeedLot`: germplasm (PROTECT), program, unique `lot_code` (auto-generated), `quantity_grams`/`reserved_grams`, `seed_count`, storage location text, harvest date, optional `source_plot`, germination rate/date, lifecycle `status`, notes, timestamps, and `created_by`/`updated_by`.
- `SeedTransaction`: an immutable ledger entry (`initial_deposit`, `harvest_deposit`, `planting_deduction`, `distribution`, `adjustment`) against a `SeedLot`.

The automatic germplasm and seed-lot identifier strategies are recorded in
[ADR-0001](adr/0001-germplasm-identifier-save-strategy.md).

### 3.4 Trial Models

- `Trial`: unique code, optional BrAPI study ID, program, protected location and season, design type (RCBD/alpha-lattice/augmented/p-Rep/Latin Square/unreplicated/other), replication count, block size (alpha-lattice/augmented), `prep_fraction` (p-Rep), lifecycle `status` (active/completed/archived), breeding `generation` index, field-grid dimensions (`field_rows`/`field_cols`), `starting_corner`, `advancement_direction`, `layout_schema` (serpentine/cartesian), dates, notes, timestamps, and `created_by`/`updated_by` fields.
- `Plot`: trial, protected germplasm, replication/block/position fields (`row`/`column` for spatial views), lifecycle status, check flag (`is_check`), `is_border`, incomplete block index (for alpha-lattice/augmented), and a trial-scoped unique plot number. *(Note: plots deliberately omit `created_by`/`updated_by` to avoid write overhead)*.
- `ObservationVariable`: global trait name and code, unit, type (including `categorical` with `categorical_options`), `category` (agronomic/disease/quality/phenology/morphological/abiotic), validation range, required flag, creation timestamp, and `created_by`/`updated_by` fields.
- `TraitPanel`: program, name, and a set of `ObservationVariable`s grouped for a specific scoring event.
- `Observation`: plot, protected variable, observation time, typed value fields, notes, and creation timestamp. *(Note: observations deliberately omit `created_by`/`updated_by` to avoid write overhead)*.
- `AnalysisSet`: name, program, description, trials (Many-to-Many), creation timestamp, and `created_by` field. Used to group trials for multi-environment analyses and as an optional GBLUP training set.

Observation validation enforces the selected variable's data type, numeric
range, and whole-number requirement. The decision to keep traits global is
recorded in [ADR-0002](adr/0002-global-observation-variable-scope.md).

### 3.5 Genomics Models (`apps.genomics`)

- `GenotypeDataset`: name, program, species, `file_format` (matrix/vcf/hapmap), marker/sample counts, ordered marker/sample name lists (JSON), the encoded dosage matrix (JSON), `imputation_method`, `maf_threshold`, description, timestamps, and `created_by`.
- `GenotypeSample`: links one dataset row (`sample_id`) to a `Germplasm` accession, with call rate and heterozygosity.
- `GenomicPrediction`: one GBLUP/rrBLUP training run — name, program, `trait` (an `ObservationVariable`), `genotype_dataset` (PROTECT), optional `training_trial`/`training_analysis_set`, `model_type`, training/candidate line counts, `cv_accuracy`/`cv_mse`, `genomic_heritability`, variance components, fixed-effect `mu`, `status`, and `created_by`.
- `GenomicBreedingValue`: one GEBV per `(prediction, germplasm)` — `gebv`, `reliability` ($r^2$), `standard_error`, `rank`, and whether the line was `is_training` or an unphenotyped candidate.
- `DiagnosticMarker`: a named functional marker (gene symbol, chromosome, target trait, `trait_category`, favorable/unfavorable allele, `assay_type`), optionally scoped to a program (null = global).
- `MarkerScore`: one allele call per `(marker, germplasm)` — `call_status` (favorable/heterozygous/unfavorable/missing), raw genotype string, notes.

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
| `/api/audit/recent_changes/` | Chronological recent record changes (admin-only) |
| `/api/germplasm/` | Germplasm CRUD |
| `/api/germplasm/bulk_import/` | Bulk CSV/Excel germplasm import |
| `/api/crosses/` | Cross CRUD |
| `/api/crossing-blocks/` | Crossing block CRUD |
| `/api/crossing-blocks/{id}/plan_crosses/` | Pair female × male candidates into planned crosses |
| `/api/crossing-blocks/{id}/execute_all/` | Harvest all crosses (auto-creates F1 germplasm + seed lots) |
| `/api/crossing-blocks/{id}/crossing_map/` | Diallel matrix / nursery sowing map |
| `/api/crossing-blocks/{id}/export_map/` | Export the sowing map (CSV/Excel¹) |
| `/api/crossing-blocks/{id}/bulk_status/` | Bulk-update cross statuses |
| `/api/seed-lots/` | Seed lot CRUD |
| `/api/seed-lots/{id}/adjust/` | Record a ledgered quantity adjustment |
| `/api/seed-lots/{id}/label/` | Barcode/QR label data for one lot |
| `/api/seed-lots/bulk-labels/` | Barcode/QR label sheet for multiple lots |
| `/api/seed-lots/{id}/split/` | Split a lot into a new sub-lot |
| `/api/seed-lots/low_stock/` | Lots below a viability/quantity threshold |
| `/api/seed-transactions/` | Seed transaction ledger (read-only) |
| `/api/trials/` | Trial CRUD |
| `/api/trials/{id}/create_plots/` | Generate plot layouts (RCBD/alpha-lattice/augmented/p-Rep/Latin Square) |
| `/api/trials/{id}/harvest_plots/` | Bulk plot harvest transition |
| `/api/trials/{id}/summary/` | Per-trait numeric statistics |
| `/api/trials/{id}/export_csv/` | Observations export — streaming CSV, or buffered Excel¹ |
| `/api/trials/{id}/advance_plots/` | Advance selected plots to next-generation germplasm |
| `/api/trials/{id}/export_fieldbook/` | Field Book export — streaming CSV, or buffered Excel¹ |
| `/api/trials/{id}/import_fieldbook/` | Import/update observations from a Field Book CSV/Excel¹ file |
| `/api/trials/{id}/spatial_heatmap/` | Trait-colored 2D plot grid |
| `/api/trials/{id}/export_map/` | Export the field map (CSV/Excel¹) |
| `/api/trials/{id}/batch_update_plots/` | Manual plot-editor corrections after layout generation |
| `/api/trials/{id}/add_grid_cells/` | Extend a trial's field grid |
| `/api/plots/` | Plot CRUD |
| `/api/observation-variables/` | Trait vocabulary CRUD |
| `/api/trait-panels/` | Reusable trait-panel CRUD |
| `/api/observations/` | Observation CRUD |
| `/api/observations/bulk_create/` | Bulk observation spreadsheet grid submission |
| `/api/analysis-sets/` | Analysis set CRUD |
| `/api/analysis-sets/{id}/heritability/` | Broad-sense heritability estimation |
| `/api/analysis-sets/{id}/ranking/` | Genotype adjusted mean ranking (BLUEs/BLUPs) |
| `/api/genotype-datasets/` | Genotype dataset CRUD |
| `/api/genotype-datasets/{id}/upload_file/` | Ingest a VCF/HapMap/matrix genotype file |
| `/api/genotype-datasets/{id}/grm_matrix/` | VanRaden G-matrix (kinship) for a dataset |
| `/api/genomic-predictions/` | Genomic prediction (GBLUP run) CRUD |
| `/api/genomic-predictions/run_prediction/` | Train a GBLUP model and produce GEBVs |
| `/api/genomic-predictions/{id}/gebvs/` | List GEBVs for a prediction run |
| `/api/genomic-predictions/{id}/export_gebv_csv/` | Export GEBVs (CSV/Excel¹) |
| `/api/diagnostic-markers/` | Diagnostic marker library CRUD |
| `/api/diagnostic-markers/seed_defaults/` | Seed the default wheat functional-marker library |
| `/api/marker-scores/` | Marker allele-call CRUD |
| `/api/marker-scores/stacking_overview/` | MAS favorable-allele trait-stacking matrix |
| `/api/marker-scores/batch_score/` | Bulk allele-call entry |

List viewsets support `DjangoFilterBackend`, `SearchFilter`, and
`OrderingFilter`, with a default page size of 100. Program-scoped viewsets
additionally restrict results to the requester's own program via
`ProgramScopedQuerySetMixin` (Phase 21).

¹ Format selection uses the query parameter **`output_format=xlsx`**
(default `csv`) — not `format`, which is reserved by DRF's own content
negotiation and would 404 before reaching the view (Phase 22).

### 4.2 BrAPI v2

Compatibility endpoints are under `/brapi/v2/` (with write support for observations, observation units, and germplasm):

- `serverinfo`
- `studies`
- `germplasm` (POST writeable)
- `observations` (POST/PUT writeable)
- `observationvariables` and its `variables` alias
- `locations`
- `programs`
- `observationunits` (PUT status-writeable)

BrAPI serializers translate internal models into camelCase BrAPI fields.
`BrapiPagination` provides the BrAPI `metadata` and `result.data` envelope.
These endpoints retain the project's default authentication requirement and RBAC.

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

`apps/core/spreadsheet.py` contains the shared CSV/XLSX layer every
import and export path below is built on (Phase 22):

- `read_spreadsheet_rows`: detects CSV vs. `.xlsx` by filename and returns
  `(headers, rows)`, with every cell value coerced to a string (an
  integer-valued Excel float like `2018.0` collapses to `"2018"`) so
  downstream parsing behaves identically regardless of upload format.
  Raises `SpreadsheetReadError` on a corrupted/mismatched file — every
  caller turns that into a `400`, never a 500.
- `build_csv_response` / `build_xlsx_response` / `build_spreadsheet_response`:
  response builders for the export side. CSV stays streaming where a view
  already streamed; XLSX is always buffered in memory (openpyxl has no
  public streaming-write API), which is an accepted tradeoff at this
  platform's plot/observation-table scale.

`apps/trials/services.py` contains:

- `generate_rcbd_layout`, `generate_alpha_lattice_layout`, `generate_augmented_layout`: deterministic layout randomization generators.
- `create_plots_for_trial`: validates layout parameters and bulk-creates plots in a transaction.
- `compute_trial_summary`: calculates per-variable descriptive statistics.
- `compute_heritability`: fits phenotype G+E mixed models and estimates broad-sense heritability ($H^2$).
- `compute_cross_environment_ranking`: estimates environment-adjusted mean performance across multiple environments.
- `import_fieldbook_csv`: parses a Field Book CSV/XLSX file (via `apps.core.spreadsheet`) into created/updated `Observation` records, used by both the `import_fieldbook` API action and the `import_fieldbook` management command — a single shared implementation (Phase 22 removed a divergent duplicate that used to live only in the command).

`apps/germplasm/services.py` contains:

- `import_germplasm_csv`: transactional bulk CSV/XLSX germplasm parser and validation engine, shared by the API, the browser UI, and the `import_germplasm` management command.

`apps/germplasm/crossing_service.py` contains:

- `plan_crosses`: pairs female × male candidate lists into planned `Cross` records following a crossing block's map pattern (and reciprocals, if enabled).
- `execute_cross` / `execute_all_crosses`: transitions a cross to `harvested`, auto-creating the F1 `Germplasm` progeny (with a generated Purdy pedigree string) and a `SeedLot`.
- `generate_crossing_map`: computes the nursery sowing layout for a crossing block.

`apps/germplasm/seed_services.py` contains:

- `record_seed_transaction`: appends a ledger entry and updates the parent `SeedLot`'s balance atomically.
- `build_barcode_label_data`: assembles the fields needed for a printable barcode/QR label sheet.

`apps/genomics/services.py` contains:

- VanRaden Method-1 G-matrix construction (with shrinkage regularization) from a `GenotypeDataset`'s dosage matrix.
- A Henderson mixed-model equations (MME) solver for GBLUP, producing GEBVs, prediction-error-variance-based reliabilities, and 5-fold cross-validation accuracy for a `GenomicPrediction` run.

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
│   ├── wiki/              ← 11-chapter feature manual (docs/WIKI.md portal)
│   ├── architecture.md
│   ├── deployment.md
│   └── history.md
├── backend/
│   ├── apps/
│   │   ├── brapi/
│   │   ├── core/          ← + mixins.py (ProgramScopedQuerySetMixin),
│   │   │                    utils.py, spreadsheet.py (CSV/XLSX)
│   │   ├── germplasm/     ← + crossing_service.py, crossing_viewsets.py,
│   │   │                    seed_services.py, seed_viewsets.py
│   │   ├── trials/
│   │   └── genomics/      ← GBLUP/GEBV prediction, diagnostic markers/MAS
│   ├── config/
│   ├── requirements/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/           ← typed API client
│   │   ├── components/    ← Sidebar, TopBar, PlotGrid, ObservationGrid,
│   │   │                     OfflineSyncCenterModal, ImportGermplasmModal
│   │   ├── pages/         ← Login, Dashboard, GermplasmBrowser, CrossingBlock,
│   │   │                     SeedInventory, TrialManager, ObservationEntry,
│   │   │                     MultiEnvironmentAnalysis, Genomics, Traits,
│   │   │                     Setup, AuditTrail, DataExport
│   │   ├── services/      ← offlineStorage.ts, syncManager.ts (PWA sync)
│   │   └── store/         ← Zustand auth store
│   ├── tests/              ← Playwright end-to-end browser tests
│   ├── Dockerfile
│   ├── index.html
│   ├── playwright.config.ts
│   ├── vite.config.ts
│   └── package.json
├── scripts/backup_db.sh
├── docker-compose.yml
└── docker-compose.prod.yml  ← Nginx reverse proxy + production stack
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

The verified baseline is **287 passed, 1 skipped** (288 tests total via
`pytest --collect-only`). The skipped test exercises optional Sentry
initialization and runs when the production Sentry dependency is
installed. This includes the Phase 21 hardening suites
(`test_program_scoping.py`, `test_crash_hardening.py`,
`test_data_integrity.py` under `apps/core`, `apps/germplasm`,
`apps/trials`, `apps/genomics`, and `apps/brapi/tests/`) and Phase 22's
CSV/XLSX round-trip coverage (`apps/core/tests/test_spreadsheet.py` plus
`.xlsx` variants added to the germplasm/fieldbook import and trial/GEBV/
crossing-map export test files), on top of the Phase 14–19 crossing/seed/
genomics/trial-editor domains and their test coverage. The last documented
baseline before this growth (through Phase 13) was 114 tests. Phase 22's
frontend changes (the germplasm bulk-import modal and the CSV/Excel
format toggles) were additionally verified live in a real browser —
login, upload a CSV, upload an `.xlsx`, confirm both sets of records
appear, toggle export format and confirm the downloaded file's
`Content-Type` — which caught two bugs (see
[IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md) Phase 22) that
neither the type checker nor the test suite would have. A precise
per-area breakdown is not maintained here — use `--collect-only -q`
grouped by directory for a current count by domain.

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

- Multi-institution data federation.
- Drone or image-based phenotyping integration.

Advanced multi-environment analysis (§13), genomic/marker-based analysis
(§19), multi-tenant program scoping (§21), and spreadsheet formats beyond
CSV (§22) have all shipped and are no longer open items. The two
remaining items above are opportunities, not scheduled roadmap work.

## 11. Coding Rules

- Keep shared state in `apps.core`, pedigree/crossing/seed-inventory work in
  `apps.germplasm`, trial work in `apps.trials`, genomic prediction and MAS
  in `apps.genomics`, and BrAPI translation in `apps.brapi`.
- Put cross-model workflows in services and bulk exchange in management
  commands.
- Validate payload shape in serializers, domain invariants in models, and
  workflow preconditions in services.
- Use `select_related`/`prefetch_related`, transactions, and bulk operations
  where appropriate.
- Add success and failure-path tests for behavior changes.
- Keep secrets and deployment-specific values in environment configuration.
