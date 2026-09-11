# Chapter 10: System Setup, Roles & Audit Trail

The **System Setup & Audit** modules give breeding directors and system administrators full oversight over organizational entities, user permissions, telemetry, and system accountability.

---

## 1. Setup Configuration

Under the **⚙️ Setup** page (restricted to `admin` and `breeder` roles):

### 1. Programs
- Create and manage breeding programs (e.g. *Bread Wheat Main Program*, *Durum Wheat Program*, *Spring Wheat Elite Line Development*).
- Define target crops (e.g. `wheat`, `barley`, `triticale`).

### 2. Locations / Field Stations
- Register experimental testing sites with geographic latitude, longitude, country, and climatic region.
- Enables spatial mapping and multi-location trial allocations.

### 3. Seasons
- Configure breeding cycles (e.g. `2024-Winter`, `2025-Spring`, `2026-Main`).
- Binds trials and crossing blocks to specific agronomic years.

### 4. Observation Variables
- Define organizational trait ontologies, acceptable min/max boundary constraints, and categorical options.

---

## 2. User Roles & Account Administration

User permissions are governed via `UserProfile` linked to Django's standard authentication framework:

### Assigning Roles:
1. Navigate to the **⚙️ Setup $\to$ User Management** tab or Django Admin (`/admin/`).
2. Select the target user and assign one of:
   - `admin`: Complete administrative authority.
   - `breeder`: Operational authority across germplasm, trials, crosses, and genomics.
   - `technician`: Data collection and scoring authority.
   - `viewer`: Read-only reporting access.
3. Assign the user's primary breeding program.

---

## 3. Real-Time Audit Trail ("Recent Changes")

To maintain complete compliance, pedigree provenance, and accountability:
- Core models (`Germplasm`, `Trial`, `Plot`, `Observation`, `SeedLot`, `GenomicPrediction`) maintain `created_at`, `updated_at`, `created_by`, and `updated_by` audit fields.
- Under **🛡️ Audit Trail**, administrators can:
  - Filter change events by user, model entity, and date range.
  - Review historical updates, plot advances, and bulk data operations.

---

## 4. System Telemetry & Health Monitoring

The platform provides production-grade observability:
- **Health Check Endpoint**: `GET /api/health/` returns database connectivity status and service readiness (`200 OK` or `503 Service Unavailable`).
- **Prometheus Metrics**: `GET /api/metrics/` exposes latency histograms, database query counters, active sessions, and HTTP request throughput for Prometheus / Grafana dashboards.

---

## 5. Next Steps

Proceed to [Chapter 11: Developer, Statistical & Architecture Reference](file:///c:/wheat-breeding-platform/docs/wiki/11_DEVELOPER_AND_STATISTICAL_REFERENCE.md) for technical derivations, data model schemas, and developer workflows.
