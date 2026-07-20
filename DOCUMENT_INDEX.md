# Document Index

Updated: 2026-07-20

All six implementation phases are complete. This index distinguishes current
operational references from historical summaries.

## Current Documents

| Document | Purpose |
|---|---|
| [README.md](README.md) | Setup, local development, test commands, and service URLs |
| [NEXT_PHASE_SUMMARY.md](NEXT_PHASE_SUMMARY.md) | Current handoff state and uncommitted product opportunities |
| [docs/architecture.md](docs/architecture.md) | Current architecture, data model, components, and boundaries |
| [API_IMPLEMENTATION_GUIDE.md](API_IMPLEMENTATION_GUIDE.md) | Internal API, BrAPI, OpenAPI, Swagger UI, and ReDoc reference |
| [docs/deployment.md](docs/deployment.md) | Production environment, Docker, static files, logging, monitoring, and backups |
| [SECURITY_FIXES.md](SECURITY_FIXES.md) | Current security controls and verification |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Completed phase plan and success criteria |
| [ISSUES_QUICK_REFERENCE.md](ISSUES_QUICK_REFERENCE.md) | Issue-by-issue resolution record for the original review |
| [docs/adr/README.md](docs/adr/README.md) | Accepted architecture decision index |

## History

The June 2026 code-review report and its companion README were retired after
all 55 findings were resolved. Their concise replacement is
[docs/history.md](docs/history.md); full originals remain available in Git
history.

## Completion Snapshot

| Phase | Status | Result |
|---|---|---|
| 1 — Security Hardening | Complete | Secure environment defaults, authentication, CORS, and headers |
| 2 — REST API | Complete | CRUD, routing, RBAC, and plot generation |
| 3 — Database Optimization | Complete | Indexes, constraints, validation, and query optimization |
| 4 — Feature Completeness & Quality | Complete | Filtering, errors, data exchange, statistics, tests, and FK protection |
| 5 — Production Readiness | Complete | Deployment stack, BrAPI, observability, backups, and CI |
| 6 — Documentation & Tech-Debt Cleanup | Complete | Current docs, OpenAPI annotations, ADRs, and history consolidation |

The verified Phase 6 baseline is **77 passed and 1 skipped**. The skip is the
optional Sentry initialization test when the production-only SDK is not
installed.

## Reading Paths

New contributor:

1. [README.md](README.md)
2. [NEXT_PHASE_SUMMARY.md](NEXT_PHASE_SUMMARY.md)
3. [docs/architecture.md](docs/architecture.md)

API consumer:

1. [API_IMPLEMENTATION_GUIDE.md](API_IMPLEMENTATION_GUIDE.md)
2. Swagger UI at `/api/schema/swagger-ui/`
3. ReDoc at `/api/schema/redoc/`

Production operator:

1. [docs/deployment.md](docs/deployment.md)
2. [SECURITY_FIXES.md](SECURITY_FIXES.md)
