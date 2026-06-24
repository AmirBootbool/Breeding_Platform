# Wheat Breeding Platform

A Phase 0/1 scaffold for a wheat breeding data management platform.

## Quick Start

1. Copy `.env.example` to `.env` and fill in secrets.
2. Build and run with Docker Compose:

```bash
docker compose build
docker compose up
```

3. Create Django migrations and apply them:

```bash
docker compose exec web python manage.py makemigrations

docker compose exec web python manage.py migrate
```

4. Access the site at `http://localhost:8000`.

## Testing

Run tests inside the container:

```bash
docker compose exec web pytest -q
```

## Project structure

- `backend/` — Django application
- `docker-compose.yml` — development services
- `.env.example` — environment variables template
- `docs/architecture.md` — project architecture
