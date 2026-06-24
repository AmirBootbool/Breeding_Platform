Wheat Breeding Platform — Project Plan & Architecture

Purpose of this document: This is a complete engineering brief for building a wheat breeding data management platform. It is written to be handed to an AI coding assistant (ChatGPT, Gemini, or a local LLM) as project context. Paste this whole document at the start of a new chat/session before asking for code, and refer back to specific sections ("implement Phase 2, section 5.3") rather than re-explaining the project each time.

---

1. Project Overview

1.1 Goal

Build a lean, self-hosted platform for managing a wheat breeding program's core data: germplasm and pedigree records, field trials, plot-level layouts, and phenotypic observations — with a field-data-collection workflow built in.

1.2 Scope (v1)

In scope:

- Germplasm registry with pedigree tracking
- Crossing block records
- Trial creation and plot layout/randomization
- Phenotypic observation capture (desktop entry + mobile field app integration)
- A queryable data store a single breeder/small team can run on a laptop or small server
- BrAPI (Breeding API) compatibility for interoperability with external breeding databases (e.g., T3/Wheat)

Explicitly out of scope for v1 (revisit in Phase 6+):

- Genomic data storage and genomic selection / GWAS (statistically heavy, likely needs R integration — separate project phase)
- Drone or image-based phenotyping
- Multi-institution data federation
- Advanced statistics (heritability, multi-environment trial models) — start with simple means/CVs only

1.3 Design Principles

1. Reuse before building. Don't reimplement field data collection — integrate with the existing open-source Field Book Android app rather than building a custom mobile app.
2. BrAPI-compatible from day one. Every core entity should map cleanly to a BrAPI v2 resource, even before the API layer is built. This keeps the data model honest and makes future interoperability cheap.
3. Boring technology. Pick the stack with the deepest AI-assistant training data and community support (Python/Django), not the most powerful one. The constraint is solo development time, not raw capability.
4. Admin UI before custom UI. Use Django's built-in admin interface as the primary back-office tool for as long as possible. Only build custom frontend views where Admin genuinely can't do the job (e.g., visual plot map).
5. Schema-first. Get the data model right before writing business logic. Migrations are cheap early, expensive later.

---

2. Technology Stack

Language: Python 3.12
Backend framework: Django 5.x + Django REST Framework
Database: PostgreSQL 16
Field data capture: Field Book (existing open-source Android app)
API: Django REST Framework + custom BrAPI v2 endpoint subset
Admin/back-office UI: Django Admin (customized)
Custom frontend: Django templates + HTMX, OR a small React app for the plot map view
Containerization: Docker Compose (web + db services)
Testing: pytest + pytest-django
Stats integration (later): R via subprocess, or rpy2

Hard constraint: Everything must run locally on a laptop with no GPU and 16GB RAM.

---

3. Data Model

(ER diagram and core entities omitted here for brevity — keep full spec in the project README/docs/data-model.md)

---

4. BrAPI Compatibility Plan

(See full spec in docs/brapi-mapping.md)

---

5. Module Breakdown

5.1 Germplasm & Pedigree

- CRUD via Django Admin initially
- Pedigree viewer (simple tree/ancestor list) — custom view, low priority for v1
- Bulk import from CSV (breeders will have existing spreadsheets — build an import management command early)

5.2 Crossing Block

- Record crosses made each season
- Link resulting germplasm back to parent cross

5.3 Trial Design & Plot Layout

- Create a trial, specify design type and number of reps
- Generate plot layout (randomization) — implement RCBD first (simplest), then alpha-lattice
- Output: a `Plot` record per trial entry × rep, with row/column or plot-number assignment

5.4 Field Data Capture (Field Book integration)

- Export trial/plot list in Field Book's expected import format
- Build an import pipeline for Field Book's data export (CSV) into `Observation` records
- Stretch goal: implement BrAPI write endpoint so Field Book can sync directly instead of CSV round-trip

5.5 Observation & Trait Management

- `ObservationVariable` CRUD via Admin
- Manual desktop observation entry view for traits not collected via Field Book
- Basic data validation (numeric ranges, required fields per trait)

5.6 Reporting (v1: minimal)

- Per-trial summary: mean, min, max, CV per trait
- Export trial data to CSV/Excel

5.7 Users & Permissions

- Django's built-in auth + `UserProfile.role`
- Role-based access: technicians can enter observations, breeders can manage germplasm/trials, viewers read-only

---

6. Build Roadmap

(See docs for phased roadmap — Phase 0: scaffolding, Phase 1: core models, etc.)

---

7. Repository Structure

(Scaffolded in this repo)

---

8. Non-Functional Requirements

- Must run fully locally via `docker compose up` on a laptop with no GPU and 16GB RAM
- All endpoints and models should be covered by at least basic pytest tests before being considered "done"

---

9. Open Decisions

- Genomic data storage approach
- R integration method
- Hosting for multi-user use
- Alpha-lattice implementation choice

---

10. Reference Material

- BrAPI specification: https://brapi.org/specification
- Breedbase: https://breedbase.org/
- T3/Wheat: https://wheat.triticeaetoolbox.org/
- Field Book: search on F-Droid / GitHub

---

11. How to Use This Document With an AI Coding Assistant

Paste this file at the start of a session and reference phases/modules when requesting work.
