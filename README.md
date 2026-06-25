# Wheat Breeding Platform

A Phase 0/1 scaffold for a wheat breeding data management platform.

## Local development (recommended)

1. Copy `.env.example` to `.env` and fill in secrets.
   - For local development, keep `USE_SQLITE=True`.
   - If you later want Docker/Postgres, set `USE_SQLITE=False`.

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

5. Run the development server:

```powershell
python manage.py runserver
```

6. Open the app in your browser:

```text
http://localhost:8000
```

## Docker / Postgres (optional)

If you want to run the app with Postgres, install Docker Desktop and use the compose stack.

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

4. Check that Django is using the Postgres database:

```powershell
docker compose exec web python manage.py check --database default
```

5. Visit the app at:

```text
http://localhost:8000
```

## Testing

Run the test suite locally with the activated virtual environment:

```powershell
cd backend
python -m pytest -q
```

## Notes

- `USE_SQLITE=True` is fine for local development and quick iteration.
- Use `USE_SQLITE=False` only when you want to test against Postgres.
- `.venv/` is ignored by git so your local virtual environment does not get committed.

## Project structure

- `backend/` — Django application and project code
- `docker-compose.yml` — local development services for Django and Postgres
- `.env.example` — example environment variables template
- `docs/architecture.md` — project architecture notes
