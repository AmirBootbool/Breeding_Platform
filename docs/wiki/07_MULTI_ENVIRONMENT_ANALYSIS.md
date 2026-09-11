# Chapter 07: Multi-Environment Trials & Heritability ($H^2$)

The **Multi-Environment Trial Analysis (MET)** module performs joint statistical analysis across multiple locations and seasons to separate true genetic variance from Genotype $\times$ Environment ($G \times E$) interaction and micro-environmental noise.

---

## 1. Analysis Sets

An **Analysis Set** (`AnalysisSet`) groups multiple related trials (e.g. *Advanced Yield Trials 2024–2026 across 4 Field Stations*) for unified biometrical analysis.

### Creating an Analysis Set:
1. Navigate to **📈 Multi-Env Analysis** and click **+ New Analysis Set**.
2. Select your breeding program and pick 2 or more trials spanning distinct seasons or locations.
3. The platform validates environmental coverage (at least 2 environments required for $G \times E$ decomposition).

---

## 2. Mixed Linear Model & Broad-Sense Heritability ($H^2$)

To estimate broad-sense heritability ($H^2$), the platform fits a random-effects mixed linear model:

$$y_{ijk} = \mu + g_i + e_j + (ge)_{ij} + r_{k(j)} + \varepsilon_{ijk}$$

where:
- $\mu$: Overall population mean.
- $g_i \sim N(0, \sigma^2_g)$: Random genetic effect of genotype $i$.
- $e_j \sim N(0, \sigma^2_e)$: Environmental effect of location/season $j$.
- $(ge)_{ij} \sim N(0, \sigma^2_{ge})$: Genotype $\times$ Environment interaction effect.
- $\varepsilon_{ijk} \sim N(0, \sigma^2_\varepsilon)$: Residual experimental error.

### Broad-Sense Heritability Formula:

$$H^2 = \frac{\sigma^2_g}{\sigma^2_g + \frac{\sigma^2_{ge}}{E} + \frac{\sigma^2_\varepsilon}{E \times R}}$$

where $E$ is the number of environments and $R$ is the average number of replications per environment.

### Heritability Bands Interpretation:
- 🟢 **High Heritability ($H^2 \ge 0.60$)**: Strong genetic signal; phenotypic selection is highly effective.
- 🟡 **Moderate Heritability ($0.30 \le H^2 < 0.60$)**: Moderate $G \times E$ interaction; replication across multiple locations recommended.
- 🔴 **Low Heritability ($H^2 < 0.30$)**: High environmental noise; requires genomic selection or intensive multi-year testing.

---

## 3. Cross-Environment Line Rankings (BLUEs / BLUPs)

The analysis produces environment-adjusted means for each germplasm line:
- **Adjusted Mean (BLUE / BLUP)**: Estimated true genotype performance removing location and block bias.
- **Raw Mean**: Unadjusted arithmetic average across all plots.
- **Family Group Clustering**: Toggle "Group by Pedigree Family" to cluster lines by shared parentage (full-sibs and half-sibs).
- **Interactive GxE Performance Chart**: Grouped bar charts showing how each elite candidate performed in each individual environment.

---

## 4. Next Steps

Proceed to [Chapter 08: Genomic Selection & Diagnostic MAS](file:///c:/wheat-breeding-platform/docs/wiki/08_GENOMIC_SELECTION_AND_MAS.md) to incorporate molecular markers and predict breeding values for unphenotyped lines.
