# Chapter 11: Developer, Statistical & Architecture Reference

This chapter documents the technical architecture, mathematical foundations, database schema, and developer workflows for software engineers and biometricians working on the Wheat Breeding Platform.

---

## 1. System Architecture & Domain Boundaries

The application is structured into decoupled domain packages under `backend/apps/`:

```
backend/
├── apps/
│   ├── core/         # Organization domain: Program, Location, Season, UserProfile, RBAC
│   ├── germplasm/    # Pedigree domain: Germplasm, Cross, SeedLot, SeedTransaction
│   ├── trials/       # Trial domain: Trial, Plot, ObservationVariable, Observation, AnalysisSet, TraitPanel
│   ├── genomics/     # Genomics domain: GenotypeDataset, GenomicPrediction, GEBV, DiagnosticMarker, MarkerScore
│   └── brapi/        # Standards translation: BrAPI v2.1 controllers and serializers
└── config/           # Django settings, middleware, root URLs, WSGI/ASGI
```

### Frontend Architecture
- **Framework**: React 18 + TypeScript + Vite.
- **Routing**: React Router v6.
- **Server State Management**: `@tanstack/react-query` (with automatic cache invalidation on mutations).
- **Client State**: `zustand` (authentication token and UI dark/sunlight themes).
- **Charts**: `recharts` (Scatter plots, grouped bar charts, distribution histograms).

---

## 2. Statistical & Mathematical Formulations

### 1. VanRaden Genomic Relationship Matrix (Method 1)
Given dosage matrix $M \in \mathbb{R}^{N \times M}$ with entries in $\{0, 1, 2\}$, where $N$ is samples and $M$ is markers:
- Allele frequency vector $p \in \mathbb{R}^M$: $p_j = \frac{1}{2N} \sum_{i=1}^N M_{ij}$.
- Centered matrix $Z = M - 2 \mathbf{1} p^T$.
- Normalization constant $c = 2 \sum_{j=1}^M p_j (1 - p_j)$.
- Raw kinship matrix: $G_0 = \frac{Z Z^T}{c}$.
- Regularized positive-definite kinship matrix with shrinkage $\lambda = 0.01$:
  $$G = (1 - \lambda) G_0 + \lambda I_N$$

### 2. Henderson's Mixed Model Equations (GBLUP)
The standard linear mixed model is:
$$y = X \beta + Z_{\text{train}} u + \varepsilon$$
where $\beta$ is fixed population mean $\mu$, $u \sim N(0, G \sigma^2_g)$ are random breeding values, and $\varepsilon \sim N(0, I \sigma^2_e)$.

Henderson's MME linear system is expressed as:
$$\begin{bmatrix} X^T X & X^T Z_{\text{train}} \\ Z_{\text{train}}^T X & Z_{\text{train}}^T Z_{\text{train}} + \gamma G^{-1} \end{bmatrix} \begin{bmatrix} \hat{\beta} \\ \hat{u} \end{bmatrix} = \begin{bmatrix} X^T y \\ Z_{\text{train}}^T y \end{bmatrix}$$
where variance ratio $\gamma = \frac{\sigma^2_e}{\sigma^2_g} = \frac{1 - h^2}{h^2}$.

The prediction error variance for line $i$ is:
$$\text{PEV}_i = C^{uu}_{ii} \sigma^2_e$$
where $C^{uu}$ is the random-effect submatrix of the inverted coefficient matrix $C^{-1}$.

The line reliability index $r^2_i$ is:
$$r^2_i = 1 - \frac{\text{PEV}_i}{G_{ii} \sigma^2_g}$$

### 3. Alpha-Lattice Design Constraints
For an incomplete block design with $v$ entries, $r$ replications, and block size $k$:
- Number of incomplete blocks per replication: $s = v / k$.
- Constraint: $v \pmod k = 0$ (entries must be evenly divisible by block size).
- Number of total plots: $N_{\text{plots}} = v \times r$.

---

## 3. Developer Workflows & Commands

### Backend Environment Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
```

### Running Test Suites
```powershell
cd backend
# Run full test suite
.\.venv\Scripts\python -m pytest -q

# Run specific domain test module
.\.venv\Scripts\python -m pytest apps/genomics/tests/ -v
```

### OpenAPI Schema Validation
```powershell
cd backend
.\.venv\Scripts\python manage.py spectacular --file openapi.yaml --validate
```

### Frontend Typecheck & Build
```powershell
cd frontend
# TypeScript verification
npx tsc --noEmit

# Production bundle build
npm run build

# Start local dev server
npm run dev
```

---

## 4. Summary & Navigation

For higher-level operational guides, return to the [Master Wiki Portal](file:///c:/wheat-breeding-platform/docs/WIKI.md).
