# Document Index

Updated: 2026-07-04

Navigation guide for the wheat-breeding-platform documentation.
All five phases of the implementation roadmap are complete, including the original 55 code-review issues and Phase 5 Production Readiness.


---

## Current Documents (Actively Maintained)

These documents reflect the live state of the codebase and should be your
primary references.

| Document | What it contains | When to read it |
|----------|-----------------|-----------------|
| [README.md](README.md) | Setup instructions, prerequisites, local dev workflow | First time cloning the repo |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Five-phase plan with all five phases (Phases 1–5) completed | Planning the next sprint or reviewing progress |
| [NEXT_PHASE_SUMMARY.md](NEXT_PHASE_SUMMARY.md) | Handoff document: what's implemented, what's next, key decisions | Starting a new work session |
| [SECURITY_FIXES.md](SECURITY_FIXES.md) | Security configuration status — all original findings fixed | Auditing security posture or onboarding DevOps |
| [API_IMPLEMENTATION_GUIDE.md](API_IMPLEMENTATION_GUIDE.md) | API reference: endpoints, serializers, viewsets, permissions | Working on or consuming the REST API |
| [ISSUES_QUICK_REFERENCE.md](ISSUES_QUICK_REFERENCE.md) | All 55 original issues with current status (~40 resolved) | Checking whether a specific issue has been addressed |
| [docs/architecture.md](docs/architecture.md) | Comprehensive engineering reference: models, services, design decisions | Understanding system internals |

---

## Historical Documents (Snapshot — June 28, 2026)

These documents were generated during the original code review on **June 28, 2026**.
They are preserved for reference, but **most issues they describe have since been
resolved**. Do not treat them as a current to-do list.

| Document | Notes |
|----------|-------|
| [CODE_REVIEW_REPORT.md](CODE_REVIEW_REPORT.md) | Comprehensive review that identified the original 55 issues. Security, API, and DB items are now fixed. |
| [README_CODE_REVIEW.md](README_CODE_REVIEW.md) | Short summary of the code review scope and methodology. |

---

## Issue Resolution Status

Of the **55 issues** identified in the original code review:

| Category | Resolved? | Details |
|----------|-----------|---------|
| Security (10 issues) | ✅ All fixed | SECRET_KEY, DEBUG, ALLOWED_HOSTS, CORS, auth, password validators, HTTPS cookies, headers |
| API & Views (10 issues) | ✅ All fixed | Serializers, viewsets, routing, permissions, token auth for all 3 apps |
| Database & Models (11 issues) | ✅ All fixed | Indexes, timestamps, select_related, constraints, validations |
| Testing (6 issues) | ✅ All fixed | 58 tests passing; test fixtures via conftest.py; consolidated duplicate test files |
| Admin (5 issues) | ✅ All fixed | All 10 models registered with full admin configuration |
| Code Quality (5 issues) | ✅ All fixed | black, isort, flake8 configured in pyproject.toml / .flake8; coreapi removed |
| Documentation (7 issues) | ✅ All fixed | Architecture doc written; inline docstrings; Next Phase summaries updated |

**Bottom line:** All 55 issues resolved.

---

## Completed Work — Phase 5: Production Readiness

Phase 5 has been fully implemented and verified. The details can be referenced in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md):

- **Structured Logging**: Gated on `DEBUG`, outputs JSON to stdout in production, and simple formatted strings in development.
- **Deployment Hardening**: Enabled Gunicorn as WSGI server, WhiteNoise middleware for static files, and secure cookie/redirect settings.
- **BrAPI v2 Endpoints**: Fully compatible read-only endpoints (studies, germplasm, observations, variables).
- **Monitoring & Backups**: Public health check endpoint at `/api/health/` and PostgreSQL backup/restore guidelines in [docs/deployment.md](docs/deployment.md).

---


## Quick-Start Reading Order

**New contributor?**
1. README.md → setup & run locally
2. NEXT_PHASE_SUMMARY.md → understand current state
3. docs/architecture.md → learn the domain model

**Deploying or extending the platform?**
1. NEXT_PHASE_SUMMARY.md → context & current state
2. docs/deployment.md → production stack & backups setup
3. API_IMPLEMENTATION_GUIDE.md → API endpoints reference


**Reviewing history?**
1. CODE_REVIEW_REPORT.md → original findings
2. ISSUES_QUICK_REFERENCE.md → issue-by-issue status
