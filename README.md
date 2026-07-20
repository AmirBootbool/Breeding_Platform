# Wheat Breeding Platform

A self-hosted data management platform for wheat breeding programs. Manages
germplasm registry with pedigree tracking, crossing blocks, trial design with
RCBD plot layout generation, and phenotypic observation capture — with role-based
access control and a full REST API.

## Current Status

- **77 tests passing** (plus 1 optional Sentry test skipped when its production
  dependency is not installed)
- Full CRUD API for 10 domain models with token authentication
- Role-based permissions (admin / breeder / technician / viewer)
- RCBD plot generation with seeded randomization
- CSV/Field Book import and export commands, trial summary statistics, and
  read-only BrAPI v2 endpoints
- OpenAPI schema with interactive Swagger UI and ReDoc documentation
- Django Admin configured for all models

See [docs/architecture.md](docs/architecture.md) for the full engineering
reference and [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for phase
history and status.

## Local development (recommended)

1. Copy `.env.example` to `backend/.env` and fill in secrets.
   - For local development, keep `USE_SQLITE=True` and `DJANGO_DEBUG=True`.

2. Create and activate a Python virtual environment in `backend`:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

3. Install Python dependencies:

```powershell
pip install -r requirements.txt
```

4. Create database migrations and apply them:

```powershell
python manage.py makemigrations
python manage.py migrate
```

5. Create a superuser:

```powershell
python manage.py createsuperuser
```

6. Run the development server:

```powershell
python manage.py runserver
```

7. Open the app in your browser:

```text
Admin:       http://localhost:8000/admin/
API:         http://localhost:8000/api/
OpenAPI:     http://localhost:8000/api/schema/
Swagger UI:  http://localhost:8000/api/schema/swagger-ui/
ReDoc:       http://localhost:8000/api/schema/redoc/
```

## Docker / Postgres (optional)

If you want to run the app with Postgres, install Docker Desktop and use the
compose stack.

1. Set `USE_SQLITE=False` in `.env`.
2. Start the services:

```powershell
docker compose build
docker compose up -d
```

3. Apply migrations inside the `web` service:

```powershell
docker compose exec web python manage.py makemigrations
docker compose exec web python manage.py migrate
```

4. Visit the app at:

```text
http://localhost:8000
```

## Testing

Run the test suite locally with the activated virtual environment:

```powershell
cd backend
python -m pytest -q
```

## Project Structure

```
wheat-breeding-platform/
├── docs/architecture.md           ← engineering reference (start here)
├── docs/adr/                      ← accepted architecture decisions
├── docs/history.md                ← original code-review history
├── IMPLEMENTATION_ROADMAP.md      ← phase status and next steps
├── NEXT_PHASE_SUMMARY.md          ← session handoff document
├── backend/
│   ├── config/                    ← Django settings, URLs, WSGI
│   ├── apps/
│   │   ├── core/                  ← Program, Location, Season, UserProfile
│   │   ├── germplasm/             ← Germplasm, Cross
│   │   ├── trials/                ← Trial, Plot, ObservationVariable, Observation
│   │   └── brapi/                 ← BrAPI v2 read-only compatibility API
│   ├── tests/                     ← API + integration tests
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

## API Authentication

```bash
# Get a token
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "youruser", "password": "yourpass"}'

# Use the token
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8000/api/programs/
```
