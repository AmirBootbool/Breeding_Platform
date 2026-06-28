# Implementation Roadmap & Priority Matrix

## Priority Matrix

Issues are classified by **Severity** and **Effort** to help prioritize implementation.

### Color Coding:
- 🔴 **RED (Critical):** Security issue - must fix before production
- 🟠 **ORANGE (High):** Important functionality - fix soon
- 🟡 **YELLOW (Medium):** Nice to have - schedule for later
- 🟢 **GREEN (Low):** Minor improvements - low priority

---

## Quick Win Tasks (< 1 hour each)

These can be completed quickly and provide immediate value:

| # | Issue | Current | Fixed | Effort | Impact |
|---|-------|---------|-------|--------|--------|
| 1 | Remove .swp files | ✗ | ✓ | 5 min | 🟢 Code cleanliness |
| 2 | Add `readonly_fields` to admin | ✗ | ✓ | 15 min | 🟡 Admin UX |
| 3 | Add type hints to utils.py | ✗ | ✓ | 30 min | 🟡 Code quality |
| 4 | Add docstrings to models | ✗ | ✓ | 45 min | 🟡 Documentation |

**Total Time:** ~1.5 hours

---

## Phase 1: Critical Security (IMMEDIATE - 2 hours)

**Objective:** Fix critical security vulnerabilities before any production deployment.

| Priority | Issue | File | Line | Action | Effort | Verification |
|----------|-------|------|------|--------|--------|--------------|
| 🔴 P1 | ALLOWED_HOSTS = '*' | settings.py | 8 | Restrict to domains | 15 min | `python manage.py check` |
| 🔴 P2 | DEBUG defaults True | settings.py | 7 | Change default to False | 5 min | `django.conf.settings.DEBUG` |
| 🔴 P3 | Weak SECRET_KEY | settings.py | 6 | Require environment var | 15 min | App won't start without key |
| 🔴 P4 | No password validators | settings.py | 66 | Enable validation | 10 min | User creation test |
| 🟠 P5 | No CORS config | settings.py | - | Add CORS headers | 20 min | Frontend can access API |
| 🟠 P6 | No auth setup | settings.py | - | Configure TokenAuth | 30 min | API returns 401 without token |

**Subtasks:**
- [ ] Review and update `.env.example` with new variables
- [ ] Test each setting with `python manage.py check`
- [ ] Generate production SECRET_KEY
- [ ] Document .env requirements
- [ ] Create management command to verify security settings

**Success Criteria:**
- `python manage.py check --deploy` returns no errors
- SECRET_KEY is not visible in code
- DEBUG is False in production settings
- API requires authentication

---

## Phase 2: API Implementation (1-2 weeks)

**Objective:** Implement complete REST API with proper authentication and serialization.

### Step 2.1: Core App API (2-3 hours)

| Component | File | Status | Tasks |
|-----------|------|--------|-------|
| Serializers | `apps/core/serializers.py` | 🔴 TODO | Create Program, Location, Season, UserProfile serializers |
| ViewSets | `apps/core/viewsets.py` | 🔴 TODO | Create ModelViewSets with filtering |
| Tests | `tests/test_api_core.py` | 🔴 TODO | Add API endpoint tests |

**Deliverables:**
- Core API endpoints functional
- All endpoints tested
- Authentication enforced

### Step 2.2: Germplasm App API (2-3 hours)

| Component | File | Status | Tasks |
|-----------|------|--------|-------|
| Serializers | `apps/germplasm/serializers.py` | 🔴 TODO | Create Germplasm, Cross serializers |
| ViewSets | `apps/germplasm/viewsets.py` | 🔴 TODO | Create ModelViewSets with filtering |
| Tests | `tests/test_api_germplasm.py` | 🔴 TODO | Add API endpoint tests |

**Deliverables:**
- Germplasm API endpoints functional
- Cross relationships handled correctly
- All endpoints tested

### Step 2.3: Trials App API (3-4 hours)

| Component | File | Status | Tasks |
|-----------|------|--------|-------|
| Serializers | `apps/trials/serializers.py` | 🔴 TODO | Create Trial, Plot, Observation serializers |
| ViewSets | `apps/trials/viewsets.py` | 🔴 TODO | Create ModelViewSets with filtering |
| Tests | `tests/test_api_trials.py` | 🔴 TODO | Add API endpoint tests |

**Deliverables:**
- Trials API endpoints functional
- Plot creation through API
- Observation recording through API

### Step 2.4: URL Configuration (1 hour)

| Task | File | Status |
|------|------|--------|
| Router setup | `config/urls.py` | 🔴 TODO |
| Token auth endpoint | `config/urls.py` | 🔴 TODO |
| API documentation | `config/urls.py` | 🔴 TODO |

**Deliverables:**
- All endpoints registered
- Token generation works
- API documentation available at `/api/docs/`

---

## Phase 3: Database Optimization (1 week)

**Objective:** Add indexes, timestamps, and optimize queries.

### Step 3.1: Database Indexes (2-3 hours)

| Model | Field | Reason | Priority |
|-------|-------|--------|----------|
| Germplasm | name | Search queries | HIGH |
| Germplasm | program | Filtering | HIGH |
| Trial | trial_code | Unique lookup | HIGH |
| Trial | program | Filtering | HIGH |
| Plot | trial | Filtering | HIGH |
| Plot | germplasm | Filtering | HIGH |
| Observation | variable | Filtering | HIGH |
| Cross | female_parent | Lookup | MEDIUM |
| Cross | male_parent | Lookup | MEDIUM |

**Action:**
```python
# Add db_index=True to model fields
model_field = models.CharField(db_index=True)

# Run migrations
python manage.py makemigrations
python manage.py migrate
```

### Step 3.2: Missing Timestamps (1-2 hours)

| Model | Missing Fields | Action |
|-------|----------------|--------|
| UserProfile | created_at, updated_at | Add timestamp fields |
| Cross | created_at, updated_at | Add timestamp fields |
| Trial | created_at, updated_at | Add timestamp fields |

**Action:**
```python
# Add to models
created_at = models.DateTimeField(auto_now_add=True)
updated_at = models.DateTimeField(auto_now=True)

# Create and run migrations
python manage.py makemigrations
python manage.py migrate
```

### Step 3.3: Query Optimization (1-2 hours)

| ViewSet | Current Query | Optimized Query | Benefit |
|---------|---------------|-----------------|---------|
| TrialViewSet | Trial.objects.all() | Trial.objects.select_related(...) | Eliminate N+1 queries |
| PlotViewSet | Plot.objects.all() | Plot.objects.select_related(...) | Reduce queries |
| ObservationViewSet | Observation.objects.all() | Observation.objects.select_related(...) | Reduce queries |

**Action:** Add `select_related()` and `prefetch_related()` to ViewSets

### Step 3.4: Constraints (1 hour)

| Model | Constraint | Action |
|-------|-----------|--------|
| ObservationVariable | min_value <= max_value | Add CheckConstraint |
| Cross | female_parent != male_parent | Add validation |

---

## Phase 4: Code Quality & Testing (1 week)

**Objective:** Improve testing, documentation, and code standards.

### Step 4.1: Test Fixtures (2 hours)

| File | Status | Tasks |
|------|--------|-------|
| `tests/conftest.py` | 🔴 TODO | Create reusable pytest fixtures |
| `tests/test_api.py` | 🔴 TODO | Add comprehensive API tests |
| `tests/test_admin.py` | 🔴 TODO | Add admin interface tests |

**Action:**
```bash
python -m pytest tests/ -v  # Run all tests
python -m pytest tests/ --cov=apps --cov-report=html  # Coverage report
```

### Step 4.2: Code Formatting (1 hour)

| Tool | Config | Status |
|------|--------|--------|
| Black | pyproject.toml | 🔴 TODO |
| isort | pyproject.toml | 🔴 TODO |
| flake8 | .flake8 | 🔴 TODO |

**Action:**
```bash
black backend/
isort backend/
flake8 backend/
```

### Step 4.3: Documentation (2 hours)

| Document | Status | Tasks |
|----------|--------|-------|
| API Documentation | 🔴 TODO | Auto-generate from serializers |
| Model Docstrings | 🔴 TODO | Add comprehensive docstrings |
| Deployment Guide | 🔴 TODO | Create deployment.md |

---

## Phase 5: Performance & Production Readiness (1 week)

**Objective:** Prepare for production deployment.

### Step 5.1: Caching Layer (2 hours)

| Component | Implementation | Status |
|-----------|----------------|--------|
| Redis Setup | Install & configure | 🔴 TODO |
| Cache Settings | Add to settings.py | 🔴 TODO |
| Cache Views | Decorate expensive queries | 🔴 TODO |

### Step 5.2: Logging (1-2 hours)

| Logger | Configuration | Status |
|--------|---------------|--------|
| Django Logger | LOGGING dict | 🔴 TODO |
| Application Logger | App-specific logging | 🔴 TODO |
| Error Tracking | Sentry integration | 🟡 OPTIONAL |

### Step 5.3: Monitoring (1-2 hours)

| Metric | Tool | Status |
|--------|------|--------|
| Error Tracking | Sentry | 🟡 OPTIONAL |
| Performance Monitoring | New Relic | 🟡 OPTIONAL |
| Uptime Monitoring | UptimeRobot | 🟡 OPTIONAL |

### Step 5.4: Production Deployment (2 hours)

| Task | Status | Verification |
|------|--------|--------------|
| Configure Gunicorn | 🔴 TODO | Server starts without errors |
| Configure Nginx | 🔴 TODO | HTTPS works, static files served |
| Environment Setup | 🔴 TODO | All env vars documented |
| Database Backup | 🔴 TODO | Backup procedure documented |

---

## Implementation Timeline (Estimate)

### Week 1
- **Days 1-2:** Phase 1 - Security Fixes (2 hours) + Quick Wins (1.5 hours)
- **Days 3-5:** Phase 2.1-2.2 - Core & Germplasm API (5-6 hours/day)

### Week 2
- **Days 1-3:** Phase 2.3-2.4 - Trials API & URL Config (5-6 hours/day)
- **Days 4-5:** Phase 3.1-3.2 - Database Indexes & Timestamps (4-5 hours)

### Week 3
- **Days 1-2:** Phase 3.3-3.4 - Query Optimization (3-4 hours)
- **Days 3-5:** Phase 4 - Code Quality & Testing (5 hours)

### Week 4
- **Days 1-2:** Phase 5.1-5.2 - Caching & Logging (3-4 hours)
- **Days 3-5:** Phase 5.3-5.4 - Monitoring & Deployment (4-5 hours)

**Total Estimate:** 35-40 hours (4-5 weeks at ~8 hours/week)

---

## Success Metrics

### Security
- ✅ `python manage.py check --deploy` passes
- ✅ No hardcoded secrets in code
- ✅ All endpoints require authentication
- ✅ Rate limiting active

### API Quality
- ✅ All endpoints tested (>80% coverage)
- ✅ API documentation complete
- ✅ Response time < 500ms (p95)
- ✅ No N+1 query problems

### Code Quality
- ✅ All code formatted with Black
- ✅ Zero flake8 violations
- ✅ Type hints on 90%+ of functions
- ✅ Comprehensive docstrings

### Performance
- ✅ Database indexes on all filter fields
- ✅ Query optimization complete
- ✅ Caching layer active
- ✅ Static file handling optimized

### Testing
- ✅ >80% test coverage
- ✅ All critical paths tested
- ✅ API tests comprehensive
- ✅ Admin tests passing

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Data migration issues | Medium | High | Create comprehensive backup before schema changes |
| API breaking changes | Low | High | Implement API versioning from start |
| Performance regression | Low | High | Run load tests before each release |
| Security vulnerabilities | Low | Critical | Use OWASP checklists, security audit |

---

## Sign-Off Checklist

Before marking each phase complete:

### Phase 1 Security
- [ ] All security settings verified
- [ ] No warnings from `manage.py check --deploy`
- [ ] .env.example updated
- [ ] Team reviewed security changes

### Phase 2 API
- [ ] All endpoints working
- [ ] All endpoints tested
- [ ] API documentation generated
- [ ] Authentication verified

### Phase 3 Database
- [ ] All migrations created
- [ ] Database integrity verified
- [ ] Queries optimized (query count verified)
- [ ] No data loss during migration

### Phase 4 Quality
- [ ] Tests passing (>80% coverage)
- [ ] Code formatted consistently
- [ ] Documentation complete
- [ ] Code review approved

### Phase 5 Production
- [ ] Load testing completed
- [ ] Monitoring configured
- [ ] Deployment procedure documented
- [ ] Rollback procedure documented

---

## References

- Django Security Documentation: https://docs.djangoproject.com/en/5.1/topics/security/
- Django REST Framework Guide: https://www.django-rest-framework.org/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- pytest-django Documentation: https://pytest-django.readthedocs.io/

