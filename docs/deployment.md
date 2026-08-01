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
| `SECURE_HSTS_SECONDS` | `31536000` | Enables HSTS after HTTPS is confirmed; start with a lower value during rollout. |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | `True` | Applies HSTS to subdomains; enable only when every subdomain supports HTTPS. |
| `SECURE_HSTS_PRELOAD` | `True` | Opts into preload eligibility; enable only after reviewing the irreversible operational impact. |

---

## 3. Serving Static Files (WhiteNoise)

Static files are served directly by WhiteNoise inside the Django process.
During deployment, you must run the following command to collect all static files into `staticfiles/`:

```bash
docker compose -f docker-compose.prod.yml exec web python manage.py collectstatic --noinput
```

WhiteNoise handles compression (gzip and brotli) and configures caching headers for maximum performance.

---

## 4. Docker Deployment

To build and run the application using Docker Compose:

1. **Build and start services**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

2. **Run database migrations**:
   ```bash
   docker compose -f docker-compose.prod.yml exec web python manage.py migrate --noinput
   ```

3. **Collect static files**:
   ```bash
   docker compose -f docker-compose.prod.yml exec web python manage.py collectstatic --noinput
   ```

4. **Create a superuser**:
   ```bash
   docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
   ```

---

## 5. Logging & Monitoring

### Standard Output Logs
Logs are written to standard output (`stdout`) in JSON format when `DJANGO_DEBUG` is `False`. This allows easy integration with log aggregation platforms like:
- AWS CloudWatch / Elastic Container Service logs
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Datadog / Grafana Loki

### Sentry Error Tracking
The application has built-in integration with Sentry for real-time error tracking and performance profiling. It initializes automatically if the following environment variables are supplied:
- `SENTRY_DSN`: Sentry DSN endpoint (e.g. `https://your-public-key@o0.ingest.sentry.io/your-project-id`)
- `SENTRY_TRACES_SAMPLE_RATE`: Sample rate for transaction/performance tracing (optional, defaults to `0.1` or 10%)
- `SENTRY_PROFILES_SAMPLE_RATE`: Sample rate for profiling tracing (optional, defaults to `0.1` or 10%)

### Prometheus Metrics
System and domain-level metrics are exposed at `/api/metrics/` in the standard Prometheus text format. This endpoint is public (no authentication required) to allow Prometheus scrapers to scrape it cleanly.

It includes:
- Standard Django HTTP requests middleware instrumentation (latencies, counts).
- Django database connection/query execution counts.
- Domain-specific Gauges:
  - `wbp_germplasm_total`: Total germplasm records in the registry.
  - `wbp_trials_active_total`: Active trials count (harvest date in the future or unset).
  - `wbp_observations_total`: Total phenotypes/observations count.

Example Prometheus scrape config:
```yaml
scrape_configs:
  - job_name: 'wheat-breeding-platform'
    metrics_path: '/api/metrics/'
    static_configs:
      - targets: ['localhost:8000']
```

---

## 6. Database Backups

It is critical to run periodic backups of your PostgreSQL database. 

### Automated Backup Script
A helper script is provided at `scripts/backup_db.sh` to automate backing up the database, compressing the output to `.sql.gz`, and purging backups older than a retention threshold (defaults to 7 days).

To run the backup script:
```bash
./scripts/backup_db.sh
```

#### Configuring Retention & Paths
You can customize the backup settings by defining the following environment variables in your `.env` file:
- `BACKUP_DIR`: Directory where backups will be stored (defaults to `./backups` in project root).
- `RETENTION_DAYS`: Number of days to keep backups (defaults to `7`).
- `POSTGRES_DB`: The target database name (defaults to `wheatbreeding`).
- `POSTGRES_USER`: The PostgreSQL database user (defaults to `wheatuser`).

You can configure this script to run on a daily cron job:
```bash
0 2 * * * /path/to/project/scripts/backup_db.sh >> /var/log/db_backup.log 2>&1
```

### Manual Backup Command
To take a manual online backup of the database:
```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres db_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Command
To restore a database backup:
```bash
# 1. Drop and recreate database
docker compose -f docker-compose.prod.yml exec db dropdb -U postgres db_name
docker compose -f docker-compose.prod.yml exec db createdb -U postgres db_name

# 2. Restore from SQL file
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres db_name < backup_file.sql
```

### Automated Backup Verification
A verification script is provided at `scripts/verify_backup.sh` to automatically test that the latest backup file is restorable and valid. 

The script performs the following steps:
1. Locates the most recent `.sql.gz` backup.
2. Reads the expected row count from the sibling `.manifest.json` metadata file (created automatically during backup).
3. Recreates a throwaway PostgreSQL database `wheatbreeding_restore_check`.
4. Restores the backup SQL contents.
5. Verifies the restored row counts match or exceed the manifest expectations.
6. Cleans up by dropping the throwaway database.
7. Exits with non-zero code on failures.

To run the verification script manually:
```bash
./scripts/verify_backup.sh
```

You can configure this script to run on a weekly cron job (e.g. Sunday night) to verify your backups:
```bash
0 3 * * 0 /path/to/project/scripts/verify_backup.sh >> /var/log/db_backup_verify.log 2>&1
```
