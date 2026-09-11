# Chapter 09: Data Exchange & BrAPI v2 Standards

The platform implements standardized data exchange protocols including streaming CSV exports, mobile Field Book integration, and full **Breeding API (BrAPI v2.1)** read/write compatibility.

---

## 1. Streaming CSV & Field Book Exports

Under the **⬇️ Data Export** page or within any individual trial view:

### 1. Standard Trial CSV Export
- `GET /api/trials/{id}/export_csv/`
- Streams complete plot-level books with plot number, rep, block, range, row, germplasm name, DB ID, and all recorded phenotypic observations.

### 2. Field Book App Format
- `GET /api/trials/{id}/export_fieldbook/`
- Compatible directly with the widely used Kansas State / CIMMYT *Field Book Android App*.
- Includes formatted headers: `plot_id`, `plot_name`, `rep`, `block`, `is_check`, and defined traits.

---

## 2. Breeding API (BrAPI v2.1) Endpoints

The platform exposes standardized BrAPI v2 endpoints under the `/brapi/v2/` URL root:

| BrAPI Endpoint | HTTP Method | Description | Role Required |
|---|---|---|---|
| `/brapi/v2/serverinfo` | `GET` | BrAPI specification metadata and supported calls | Anyone / Anonymous |
| `/brapi/v2/programs` | `GET` | List all breeding programs | Read / Authenticated |
| `/brapi/v2/trials` | `GET` | List high-level trial projects | Read |
| `/brapi/v2/studies` | `GET` | List field experiments / study instances | Read |
| `/brapi/v2/studies/{id}/layouts` | `GET` | Retrieve 2D plot coordinate layout matrix | Read |
| `/brapi/v2/locations` | `GET` | Geographical trial stations & coordinates | Read |
| `/brapi/v2/germplasm` | `GET`, `POST` | Query accession pedigrees / Register new germplasm | Read (GET) / Breeder, Admin (POST) |
| `/brapi/v2/variables` | `GET` | Trait ontology and measurement scale definitions | Read |
| `/brapi/v2/observationunits` | `GET`, `PUT` | Query plots / Update plot status | Read (GET) / Technician, Breeder (PUT) |
| `/brapi/v2/observations` | `GET`, `POST`, `PUT` | Query phenotypic observations / Ingest field scores | Read (GET) / Technician, Breeder (POST/PUT) |

---

## 3. OpenAPI Schema & Interactive Swagger UI

Interactive API documentation and executable testing playgrounds are generated dynamically:
- **Swagger UI**: `/api/schema/swagger-ui/`
- **ReDoc Interactive Docs**: `/api/schema/redoc/`
- **Raw OpenAPI 3.0 YAML Schema**: `/api/schema/`

---

## 4. Next Steps

Proceed to [Chapter 10: System Setup, Roles & Audit Trail](file:///c:/wheat-breeding-platform/docs/wiki/10_ADMIN_SETUP_AND_AUDIT.md) to manage programs, seasons, user permissions, and audit logs.
