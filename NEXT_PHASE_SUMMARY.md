# Next Phase Summary

Date: 2026-07-02

## Current State

- The core architecture note is now the main source of truth: `docs/architecture.md`.
- The Django backend has API scaffolding for core, germplasm, and trials.
- Initial migrations are committed for the domain apps.
- Database optimization work is in place: indexes, timestamps, and queryset annotation for trial plot counts.
- The repo includes focused tests for models and API endpoints.

## Verified So Far

- Syntax checks passed with `python -m py_compile` on the touched Python files.
- The branch has been pushed to GitHub before this handoff.

## Next Phase

Phase 4: Code Quality & Testing.

Recommended order:

1. Reduce duplicated test coverage by consolidating shared fixtures and patterns.
2. Add permissions and role-based access checks.
3. Tighten API and admin tests around the main workflows.
4. Add the first import/export workflow, starting with a practical CSV or Field Book path.

## Coding Rules To Carry Forward

- Keep business logic in service modules when it crosses model and HTTP boundaries.
- Keep models focused on invariants and persistence.
- Keep serializers responsible for request and response shape.
- Use `select_related()` and `prefetch_related()` for relational reads.
- Add tests for every behavior change, including failure paths.
- Keep changes small and aligned with the existing app boundaries.

## Restart Point For A Fresh Session

Start the next session with:

- `NEXT_PHASE_SUMMARY.md`
- `docs/architecture.md`
- `IMPLEMENTATION_ROADMAP.md`

Begin with Phase 4 and the first permission/test cleanup pass.
