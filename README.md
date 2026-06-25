# Wheat Breeding Platform

A Phase 0/1 scaffold for a wheat breeding data management platform.

## Quick Start

1. Copy `.env.example` to `.env` and fill in secrets.
   - For local development without Docker, keep `USE_SQLITE=True`.
   - To use Postgres with Docker, set `USE_SQLITE=False` and keep `DATABASE_URL` pointed at `db`.

2. Install Python dependencies in the backend virtual environment:

```bash
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. Run migrations locally:

```bash
cd backend
.\.venv\Scripts\python.exe manage.py makemigrations
.\.venv\Scripts\python.exe manage.py migrate
```

4. Start the Django development server:

```bash
cd backend
.\.venv\Scripts\python.exe manage.py runserver
```

5. Access the site at `http://localhost:8000`.

## Docker/Postgres

To run the project with Docker and Postgres instead of SQLite:

```bash
docker compose build
docker compose up
```

Then set `USE_SQLITE=False` in `.env`.

## Testing

Run tests locally:

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

## Project structure

- `backend/` — Django application
- `docker-compose.yml` — development services
- `.env.example` — environment variables template
- `docs/architecture.md` — project architecture
