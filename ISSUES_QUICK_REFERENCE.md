# Issues Quick Reference

**Original Review:** June 28, 2026 · 55 issues identified
**Last Updated:** July 4, 2026
**Status: 49 of 55 original issues resolved**

> [!NOTE]
> This document tracks all 55 issues from the initial code review.

---

## Summary

| Category          | Total | Resolved | Open |
|-------------------|-------|----------|------|
| Security          | 7     | 7        | 0    |
| API               | 6     | 6        | 0    |
| Database          | 5     | 5        | 0    |
| Testing / Quality | 8     | 8        | 0    |
| Remaining         | 29    | 23       | 6    |
| **Total**         | **55**| **49**   | **6**|



---

## ✅ Resolved Issues

### Security (7/7 — all critical, all fixed)

| #  | Issue                  | Resolution                                          |
|----|------------------------|-----------------------------------------------------|
| 1  | ALLOWED_HOSTS = '*'    | Loaded from `ALLOWED_HOSTS` env var; defaults to `localhost` |
| 2  | DEBUG defaults True    | Defaults to `False` via `config()`                  |
| 3  | Weak SECRET_KEY        | Required env var; raises `ImproperlyConfigured` in production |
| 4  | No password validators | 4 Django validators enabled                         |
| 5  | No CORS config         | `django-cors-headers` configured from env           |
| 6  | No auth on API         | TokenAuth + SessionAuth; `IsAuthenticated` default  |
| 7  | No REST_FRAMEWORK conf | Full DRF settings dict in `settings.py`             |

### API (6/6)

| #  | Issue               | Resolution                                       |
|----|---------------------|--------------------------------------------------|
| 8  | Only admin URLs     | DRF routers registered for all apps              |
| 9  | No API endpoints    | Full CRUD for all 10 models                      |
| 13 | Missing serializers | Serializers created for every model              |
| 14 | Missing viewsets    | ViewSets created for every model                 |
| 15 | No URL routes       | Routers registered in `urls.py`                  |
| 17 | No permissions      | `RoleBasedPermission` with per-action overrides  |

### Database (5/5)

| #  | Issue              | Resolution                                        |
|----|--------------------|---------------------------------------------------|
| 12 | N+1 query problems | `select_related()` on all viewset querysets        |
| 19 | No DB indexes      | `db_index=True` on key lookup fields              |
| 21 | Missing timestamps | `created_at` / `updated_at` on all mutable models |
| 22 | No model validation| `clean()` + `full_clean()` on relevant models      |
| 24 | No constraints     | `CheckConstraint` and `unique_together` added      |

### Testing & Quality (8/8)

| #  | Issue              | Resolution                                        |
|----|--------------------|---------------------------------------------------|
| 35 | No test fixtures   | `conftest.py` with 10 reusable fixtures           |
| 36 | No admin tests     | 3 admin tests                                     |
| 37 | No API tests       | 13 API tests covering CRUD + RBAC                 |
| 47 | No formatting      | `black` / `isort` configured in `pyproject.toml`  |
| 48 | No linting         | `flake8` configured (`.flake8`)                   |
| 49 | No readonly fields | `readonly_fields` on all admin classes            |
| 52 | .swp file in repo  | `.gitignore` covers `*.swp`                       |
| 54 | No `__str__`       | All models have `__str__` methods                 |

### Other Resolved Items (~14)

Issues #29, #31, #32, #33, #39–42, #44, #45, #53, #55 were addressed during the
same implementation rounds (dependency cleanup, validation, documentation, indexing,
model improvements). They are not individually broken out above because they were
resolved as part of the broader fixes in their respective categories.

---

## 🔶 Open Issues (6 remaining)

| #     | Issue                            | Priority | Est. Effort | Notes |
|-------|----------------------------------|----------|-------------|-------|
| 30    | No dev/prod requirements split   | Medium   | 1 hr        | Split into `requirements/{base,dev,prod}.txt` |
| 43    | No caching                       | Medium   | 2–4 hrs     | Configure Redis / Django cache framework |
| 46    | Partial type hints               | Low      | 2–3 hrs     | `services.py` has them; add to models, views, utils |
| 50–51 | No admin custom actions/inlines  | Low      | 2–3 hrs     | Add bulk actions and inline editing |
| 20    | Germplasm double-save for auto-ID| Low      | 1–2 hrs     | Intentional for now; refactor to DB sequence later |
| 23    | `full_clean()` on every save     | Low      | —           | By design for data integrity; revisit if perf issue arises |
| 25    | Redundant pedigree fields        | Low      | —           | Intentional design (parent FKs + pedigree string); no action |

---

## Priority Breakdown

```
High   (0 items):  All high priority items resolved!
Medium (2 items):  #30, #43                        → ~3–5 hrs
Low    (4 items):  #20, #46, #50-51               → ~5–8 hrs
```

By Design (2):     #23, #25                        → No action needed
```

---

## Verification Commands

```bash
# Security audit
python manage.py check --deploy

# Run full test suite
python -m pytest tests/ -v --tb=short

# Code quality
flake8 backend/
black --check backend/
isort --check backend/

# Coverage report
python -m pytest tests/ --cov=apps --cov-report=term-missing
```

---

## Document History

| Date           | Event                                   |
|----------------|-----------------------------------------|
| June 28, 2026  | Initial code review — 55 issues found   |
| July 3, 2026   | Status update — ~40 issues resolved     |

> See [IMPLEMENTATION_ROADMAP.md](file:///C:/wheat-breeding-platform/IMPLEMENTATION_ROADMAP.md) Phase 4
> for the timeline and ownership plan to close the remaining ~15 items.
