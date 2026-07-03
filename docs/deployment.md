# Deployment Guide — Wheat Breeding Platform

This guide describes how to deploy and maintain the Wheat Breeding Platform in a production environment.

## 1. Production Stack
The recommended production stack consists of:
- **Application Server**: Gunicorn (WSGI HTTP server for UNIX)
- **Static Files Serving**: WhiteNoise (compresses and serves static assets directly from Django)
- **Database**: PostgreSQL 16
- **Containerization**: Docker and Docker Compose

---

## 2. Environment Variables Configuration

Create a `.env` file in the root or set these variables in your deployment environment:

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `DJANGO_DEBUG` | `False` | Must be `False` in production to disable debug pages. |
| `DJANGO_SECRET_KEY` | *[Random 50+ char string]* | Cryptographic key. Do not use default or expose it. |
| `DJANGO_ALLOWED_HOSTS` | `yourdomain.com,api.yourdomain.com` | Comma-separated list of host/domain names. |
| `CORS_ALLOWED_ORIGINS` | `https://yourdomain.com` | Comma-separated list of allowed origins for CORS. |
| `USE_SQLITE` | `False` | Set to `False` to use PostgreSQL. |
| `DATABASE_URL` | `postgres://user:password@db_host:5432/db_name` | Connection URI for the PostgreSQL database. |
| `SECURE_SSL_REDIRECT` | `True` | Redirects all HTTP requests to HTTPS (gated on `DEBUG=False`). |
| `SESSION_COOKIE_SECURE` | `True` | Forces cookies to be sent over HTTPS only. |
| `CSRF_COOKIE_SECURE` | `True` | Forces CSRF cookies to be sent over HTTPS only. |

---

## 3. Serving Static Files (WhiteNoise)

Static files are served directly by WhiteNoise inside the Django process.
During deployment, you must run the following command to collect all static files into `staticfiles/`:

```bash
docker compose exec web python manage.py collectstatic --noinput
```

WhiteNoise handles compression (gzip and brotli) and configures caching headers for maximum performance.

---

## 4. Docker Deployment

To build and run the application using Docker Compose:

1. **Build and start services**:
   ```bash
   docker compose up -d --build
   ```

2. **Run database migrations**:
   ```bash
   docker compose exec web python manage.py migrate --noinput
   ```

3. **Collect static files**:
   ```bash
   docker compose exec web python manage.py collectstatic --noinput
   ```

4. **Create a superuser**:
   ```bash
   docker compose exec web python manage.py createsuperuser
   ```

---

## 5. Logging

Logs are written to standard output (`stdout`) in JSON format when `DJANGO_DEBUG` is `False`. This allows easy integration with log aggregation platforms like:
- AWS CloudWatch / Elastic Container Service logs
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Datadog / Grafana Loki

---

## 6. Database Backups

It is critical to run periodic backups of your PostgreSQL database. 

### Backup Command
To take an online backup of the database:
```bash
docker compose exec -t db pg_dump -U postgres db_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Command
To restore a database backup:
```bash
# 1. Drop and recreate database
docker compose exec db dropdb -U postgres db_name
docker compose exec db createdb -U postgres db_name

# 2. Restore from SQL file
docker compose exec -T db psql -U postgres db_name < backup_file.sql
```
