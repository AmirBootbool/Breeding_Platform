# Chapter 01: Getting Started & Platform Overview

Welcome to the **Wheat Breeding Platform**, a comprehensive management and biometrical intelligence system engineered for modern wheat breeding programs.

---

## 1. System Overview

The platform unifies the full breeding lifecycle:
- **Parent Selection & Crossing**: Plan crosses, generate reciprocals, visualize diallel matrices, and track crossing block pollination.
- **Germplasm & Pedigrees**: Track lines from $F_0$ biparental crosses through inbreeding ($F_1 \to F_8+$), SSD (single-seed descent), and pedigree ancestry.
- **Seed Bank & Inventory**: Store lots across cold rooms, freezers, and shelves; log transactions; split lots; print barcode labels.
- **Field Trial Design**: Randomize layouts (RCBD, Alpha-Lattice, Augmented Block, p-Rep, Latin Square), generate coordinates, and inspect plots via an interactive field map.
- **High-Throughput Phenotyping**: Collect traits via desktop forms, spreadsheet bulk entry, and an offline-first PWA field scoring mobile app with sync.
- **Biometrical Multi-Environment Analysis**: Fit mixed linear models to compute broad-sense heritability ($H^2$) and environment-adjusted genotype rankings (BLUEs/BLUPs).
- **Genomic Selection & MAS**: Ingest SNP marker arrays (VCF/HapMap), calculate VanRaden $G$-matrices, predict Genomic Estimated Breeding Values (GEBVs) for unphenotyped lines, and screen diagnostic wheat functional markers (*Lr34*, *Fhb1*, *Rht-B1*, *Ppd-D1*, *Gpc-B1*, *Sr2*, *Glu-D1*).
- **Standards & Interoperability**: BrAPI v2 compliant API endpoints, streaming CSV downloads, and Field Book exchange.

---

## 2. User Roles & Permissions

The platform enforces Role-Based Access Control (RBAC) via user profiles:

| Role | Permissions & Access Level | Typical Users |
|---|---|---|
| **Admin** | Full system control: Manage all programs, user accounts, system configuration, audit trails, and destructive actions. | Breeding Program Director, IT Administrator |
| **Breeder** | Full operational control: Create/edit germplasm, design crossing blocks, randomize trials, advance lines, train GBLUP models, and record observations. | Senior Breeder, Associate Breeder, Molecular Geneticist |
| **Technician** | Field & laboratory operations: Record observations, update pollination statuses, log seed transactions, and sync field scores. Cannot delete trials or core programs. | Field Trial Manager, Phenotyping Technician, Greenhouse Assistant |
| **Viewer** | Read-only access: Browse germplasm, trial results, summary charts, and download exported datasets. | Collaborators, Academic Partners, Student Interns |

---

## 3. Navigating the Interface

The platform provides a responsive, intuitive interface accessible from desktop workstations, field tablets, and smartphones:

### Main Navigation Bar
- 🏠 **Dashboard**: Quick pipeline progress funnel, recent observation feed, low-stock seed alerts, and crossing blocks ready for harvest.
- 🌱 **Germplasm**: Search, filter, inspect pedigree family trees, compare accessions side-by-side, and bulk import lines from CSV.
- ✂️ **Crossing Block**: Manage crossing plans, track pollination progress, inspect diallel matrices, and auto-generate reciprocals.
- 📦 **Seed Inventory**: Inventory lots, storage drawer, transactions ledger, viability test alerts, and barcode printing.
- ⊞ **Trials**: Trial manager, experimental layout generator, interactive plot map grid, data collection table, and selection advancements.
- 📝 **Observation Entry**: Single plot scoring forms and high-speed spreadsheet grid entry.
- 📊 **Traits**: Standard trait library, category organization, custom Trait Panels, and formula traits.
- 🧬 **Genomics & MAS**: GBLUP genomic predictions (GEBVs), VanRaden relationship matrix PCA/heatmaps, and diagnostic wheat marker stacking.
- 📈 **Multi-Env Analysis**: Multi-trial analysis set builder, broad-sense heritability ($H^2$), and cross-environment BLUE/BLUP rankings.
- 🛡️ **Audit Trail**: Real-time log of record creations and modifications.
- ⚙️ **Setup**: Administrative management of Programs, Locations, Seasons, and Variables.

---

## 4. Outdoor High-Contrast Sunlight Mode ☀️

When scoring plots in intense direct sunlight on mobile tablets:
1. Click the **☀️ Sunlight Mode** button in the sidebar or top header.
2. The UI instantly transitions to an ultra-high-contrast white/black theme with amplified borders and glare-resistant typography.
3. Click **🌙 Dark Mode** when returning indoors or working in low-light laboratory environments.

---

## 5. Next Steps

Proceed to [Chapter 02: Germplasm & Pedigree Management](file:///c:/wheat-breeding-platform/docs/wiki/02_GERMPLASM_AND_PEDIGREE.md) to learn how germplasm accessions, pedigree notations, and generations are tracked.
