# Document Index

Updated: 2026-07-03

Navigation guide for the wheat-breeding-platform documentation.
Phases 1–3 of the implementation roadmap are complete. Approximately 40 of the
original 55 code-review issues have been resolved. Phase 4 is next.

---

## Current Documents (Actively Maintained)

These documents reflect the live state of the codebase and should be your
primary references.

| Document | What it contains | When to read it |
|----------|-----------------|-----------------|
| [README.md](README.md) | Setup instructions, prerequisites, local dev workflow | First time cloning the repo |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Five-phase plan with Phases 1–3 done and Phase 4 tasks detailed | Planning the next sprint or reviewing progress |
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
| Testing (6 issues) | ✅ Mostly done | 34 tests passing; test fixtures via conftest.py; some consolidation still needed |
| Admin (5 issues) | ✅ Done | All 10 models registered with full admin configuration |
| Code Quality (5 issues) | ✅ Done | black, isort, flake8 configured in pyproject.toml / .flake8 |
| Documentation (7 issues) | 🔶 Partial | Architecture doc written; inline docstrings still sparse |

**Bottom line:** ~40 of 55 issues resolved. Remaining items are covered by Phase 4.

---

## Remaining Work — Phase 4 (~12 hours)

These items are detailed in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md):

| Task | Est. Hours | Description |
|------|-----------|-------------|
| django-filter wiring | 1–2 h | Add `filterset_fields` to all viewsets for FK/choice filtering |
| Exception handler | 1 h | Structured error responses via custom `EXCEPTION_HANDLER` |
| CSV import/export | 4–6 h | Management commands: import_germplasm, export_trial_data, fieldbook I/O |
| Trial summary stats | 2 h | Per-trial mean/min/max/CV endpoint for observation variables |
| Test consolidation | 1 h | Remove duplicate tests, add missing negative cases |
| FK cascade review | 1 h | Switch Plot.germplasm, Trial.location, Trial.season from CASCADE to PROTECT |
| Cleanup | 0.5 h | Remove stale files, drop coreapi dep, Dockerfile EXPOSE/CMD |

---

## Phase 5 — Production Readiness (~14–22 hours, later)

- Structured logging (Django LOGGING dict)
- Deployment hardening (gunicorn, collectstatic, whitenoise)
- BrAPI v2 read-only endpoints (8–16 h, stretch)
- Monitoring & observability (Sentry, health check)
- Deployment documentation

---

## Quick-Start Reading Order

**New contributor?**
1. README.md → setup & run locally
2. NEXT_PHASE_SUMMARY.md → understand current state
3. docs/architecture.md → learn the domain model

**Picking up Phase 4?**
1. NEXT_PHASE_SUMMARY.md → context & decisions
2. IMPLEMENTATION_ROADMAP.md → detailed task list
3. API_IMPLEMENTATION_GUIDE.md → API patterns to follow

**Reviewing history?**
1. CODE_REVIEW_REPORT.md → original findings
2. ISSUES_QUICK_REFERENCE.md → issue-by-issue status
