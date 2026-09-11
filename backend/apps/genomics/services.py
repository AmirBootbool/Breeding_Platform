import io
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from numpy import linalg
import pandas as pd

from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.core.models import Program
from apps.germplasm.models import Germplasm
from apps.trials.models import AnalysisSet, Observation, ObservationVariable, Trial

from .models import (
    DiagnosticMarker,
    GenomicBreedingValue,
    GenomicPrediction,
    GenotypeDataset,
    GenotypeSample,
    MarkerScore,
)

logger = logging.getLogger("apps.genomics.services")


# ==============================================================================
# 1. Genotype File Parsers (VCF, HapMap, Numeric Matrix)
# ==============================================================================

def parse_vcf_stream(
    stream: io.TextIOBase,
) -> Tuple[List[str], List[str], np.ndarray]:
    """
    Parse a VCF file stream into:
      - marker_names: list of SNP IDs
      - sample_names: list of sample names from header
      - dosage_matrix: np.ndarray shape (n_samples, n_markers), values in [0, 2] or NaN
    """
    sample_names: List[str] = []
    marker_names: List[str] = []
    marker_dosages: List[List[float]] = []

    for line in stream:
        line_str = line.strip()
        if not line_str:
            continue
        if line_str.startswith("##"):
            continue
        if line_str.startswith("#CHROM"):
            parts = line_str.split("\t")
            if len(parts) > 9:
                sample_names = parts[9:]
            continue

        parts = line_str.split("\t")
        if len(parts) < 10 or not sample_names:
            continue

        chrom, pos, snp_id, ref, alt, qual, filt, info, fmt = parts[:9]
        marker_id = snp_id if snp_id and snp_id != "." else f"{chrom}_{pos}"
        marker_names.append(marker_id)

        format_fields = fmt.split(":")
        gt_idx = 0
        if "GT" in format_fields:
            gt_idx = format_fields.index("GT")

        calls = parts[9:]
        dosages = []
        for call in calls:
            fields = call.split(":")
            gt = fields[gt_idx] if len(fields) > gt_idx else "./."
            gt = gt.replace("|", "/")
            if gt in ("0/0", "0"):
                dosages.append(0.0)
            elif gt in ("0/1", "1/0"):
                dosages.append(1.0)
            elif gt in ("1/1", "1"):
                dosages.append(2.0)
            else:
                dosages.append(np.nan)
        marker_dosages.append(dosages)

    if not sample_names or not marker_names:
        raise ValidationError("Invalid VCF: Missing header or variant records.")

    # Shape: (n_markers, n_samples) -> transpose to (n_samples, n_markers)
    matrix = np.array(marker_dosages, dtype=float).T
    return marker_names, sample_names, matrix


def parse_hapmap_stream(
    stream: io.TextIOBase,
) -> Tuple[List[str], List[str], np.ndarray]:
    """
    Parse a HapMap (.hmp.txt) file into marker_names, sample_names, and dosage matrix.
    """
    lines = [l.strip() for l in stream if l.strip()]
    if not lines:
        raise ValidationError("HapMap file is empty.")

    header = lines[0].split("\t")
    if len(header) <= 11:
        raise ValidationError("Invalid HapMap header. Expected at least 11 metadata columns.")

    sample_names = header[11:]
    marker_names: List[str] = []
    marker_dosages: List[List[float]] = []

    # IUPAC to dosage mapping given ref / alt alleles
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) < len(header):
            continue

        rs_id = parts[0]
        alleles_str = parts[1]
        alleles = alleles_str.split("/")
        ref = alleles[0] if alleles else "A"
        alt = alleles[1] if len(alleles) > 1 else "B"

        marker_names.append(rs_id)
        calls = parts[11:]
        dosages = []
        for call in calls:
            call_clean = call.strip().upper()
            if call_clean in (ref, ref + ref):
                dosages.append(0.0)
            elif call_clean in (alt, alt + alt):
                dosages.append(2.0)
            elif call_clean in ("N", "NN", "-", "--", "?", "./."):
                dosages.append(np.nan)
            else:
                # Heterozygous call (e.g. AG, M, R, W, S, Y, K)
                dosages.append(1.0)
        marker_dosages.append(dosages)

    if not sample_names or not marker_names:
        raise ValidationError("HapMap parsing yielded 0 markers or samples.")

    matrix = np.array(marker_dosages, dtype=float).T
    return marker_names, sample_names, matrix


def parse_matrix_stream(
    stream: io.TextIOBase,
) -> Tuple[List[str], List[str], np.ndarray]:
    """
    Parse a CSV / TSV numeric dosage matrix.
    Expected format:
      SampleID,SNP_1,SNP_2,SNP_3,...
      Line_A,0,1,2,...
      Line_B,2,0,1,...
    """
    first_line = stream.readline()
    stream.seek(0)
    sep = "\t" if "\t" in first_line else ","
    df = pd.read_csv(stream, sep=sep, index_col=0)

    sample_names = [str(idx).strip() for idx in df.index]
    marker_names = [str(col).strip() for col in df.columns]
    matrix = df.to_numpy(dtype=float)

    # If coded as (-1, 0, 1), convert to (0, 1, 2)
    min_val = np.nanmin(matrix)
    if min_val < 0:
        matrix = matrix + 1.0

    return marker_names, sample_names, matrix


# ==============================================================================
# 2. Quality Control (QC) & Imputation
# ==============================================================================

def qc_and_impute_matrix(
    matrix: np.ndarray,
    marker_names: List[str],
    sample_names: List[str],
    maf_threshold: float = 0.05,
    max_missing_marker: float = 0.30,
    max_missing_sample: float = 0.40,
    imputation: str = "mean",
) -> Tuple[np.ndarray, List[str], List[str], Dict[str, Any]]:
    """
    Filter markers and samples by missingness and MAF, then impute missing dosages.
    Returns:
      (cleaned_matrix, retained_markers, retained_samples, qc_stats)
    """
    n_samples, n_markers = matrix.shape

    # 1. Sample missingness filter
    sample_missing = np.isnan(matrix).mean(axis=1)
    keep_samples_mask = sample_missing <= max_missing_sample
    matrix = matrix[keep_samples_mask, :]
    sample_names = [s for s, keep in zip(sample_names, keep_samples_mask) if keep]

    # 2. Marker missingness filter
    marker_missing = np.isnan(matrix).mean(axis=0)
    keep_markers_missing = marker_missing <= max_missing_marker
    matrix = matrix[:, keep_markers_missing]
    marker_names = [m for m, keep in zip(marker_names, keep_markers_missing) if keep]

    # 3. Calculate allele frequency & MAF filter
    col_means = np.nanmean(matrix, axis=0)
    # Allele frequency p = mean_dosage / 2.0
    p = col_means / 2.0
    p = np.clip(p, 0.0001, 0.9999)
    maf = np.minimum(p, 1.0 - p)

    keep_maf = maf >= maf_threshold
    matrix = matrix[:, keep_maf]
    marker_names = [m for m, keep in zip(marker_names, keep_maf) if keep]
    col_means = col_means[keep_maf]

    if matrix.shape[1] == 0 or matrix.shape[0] == 0:
        raise ValidationError(
            f"QC filters removed all markers or samples (MAF={maf_threshold})."
        )

    # 4. Imputation
    if imputation == "mean":
        for j in range(matrix.shape[1]):
            nan_mask = np.isnan(matrix[:, j])
            if np.any(nan_mask):
                matrix[nan_mask, j] = col_means[j]
    elif imputation == "mode":
        for j in range(matrix.shape[1]):
            nan_mask = np.isnan(matrix[:, j])
            if np.any(nan_mask):
                valid = matrix[~nan_mask, j]
                mode_val = (
                    pd.Series(valid).mode()[0] if len(valid) > 0 else col_means[j]
                )
                matrix[nan_mask, j] = mode_val

    # Replace any remaining NaNs with 0
    np.nan_to_num(matrix, copy=False, nan=0.0)

    qc_stats = {
        "original_samples": n_samples,
        "retained_samples": matrix.shape[0],
        "original_markers": n_markers,
        "retained_markers": matrix.shape[1],
        "mean_call_rate": round(float(1.0 - sample_missing.mean()), 4),
        "mean_maf": round(float(maf[keep_maf].mean()), 4) if len(maf[keep_maf]) > 0 else 0.0,
    }
    return matrix, marker_names, sample_names, qc_stats


# ==============================================================================
# 3. VanRaden Genomic Relationship Matrix (GRM)
# ==============================================================================

def compute_vanraden_grm(
    dosage_matrix: np.ndarray,
    lambda_shrinkage: float = 0.01,
) -> np.ndarray:
    """
    Compute VanRaden (2008) Method 1 Genomic Relationship Matrix G:
      p_j = mean(M[:, j]) / 2
      Z = M - 2P
      scale = 2 * sum(p_j * (1 - p_j))
      G = (Z @ Z.T) / scale
      G_reg = (1 - lambda) * G + lambda * I
    """
    n_samples, n_markers = dosage_matrix.shape
    p = np.mean(dosage_matrix, axis=0) / 2.0
    p = np.clip(p, 0.001, 0.999)

    # Centered matrix Z
    P = 2.0 * p  # shape (n_markers,)
    Z = dosage_matrix - P  # shape (n_samples, n_markers)

    denom = 2.0 * np.sum(p * (1.0 - p))
    if denom <= 0:
        denom = float(n_markers)

    G = (Z @ Z.T) / denom

    # Regularization to ensure positive definiteness
    if lambda_shrinkage > 0:
        I = np.eye(n_samples)
        G = (1.0 - lambda_shrinkage) * G + lambda_shrinkage * I

    return G


# ==============================================================================
# 4. GBLUP & Cross-Validation Engine
# ==============================================================================

def fit_gblup_solver(
    phenotypes: Dict[str, float],
    sample_names: List[str],
    G: np.ndarray,
    heritability_prior: float = 0.50,
) -> Dict[str, Any]:
    """
    Solve Henderson's Mixed Model Equations for GBLUP:
      [ X'X    X'Z   ] [ b ] = [ X'y ]
      [ Z'X  Z'Z+l*G^-1 ] [ u ]   [ Z'y ]
    where:
      - y is vector of observed phenotypes (length N_obs)
      - sample_names has all N genotyped lines (N >= N_obs)
      - b is fixed mean (mu)
      - u is vector of breeding values (GEBVs) for ALL N lines
      - l = (1 - h^2) / h^2 = sigma_e^2 / sigma_g^2
    """
    n_total = len(sample_names)
    sample_idx_map = {name: idx for idx, name in enumerate(sample_names)}

    # Identify training subset with phenotypes
    train_indices = []
    y_values = []
    for name, val in phenotypes.items():
        if name in sample_idx_map and val is not None and not np.isnan(val):
            train_indices.append(sample_idx_map[name])
            y_values.append(float(val))

    n_train = len(train_indices)
    if n_train < 3:
        raise ValidationError(
            f"Insufficient phenotyped samples ({n_train}) matching genotype dataset."
        )

    y = np.array(y_values, dtype=float)
    y_mean = float(np.mean(y))
    y_var = float(np.var(y, ddof=1)) if n_train > 1 else 1.0
    if y_var <= 0:
        y_var = 1.0

    # Invert G
    try:
        G_inv = linalg.inv(G)
    except linalg.LinAlgError:
        # Add slight jitter if singular
        G_inv = linalg.inv(G + 1e-4 * np.eye(n_total))

    # Variance components estimate
    h2 = max(0.05, min(0.95, heritability_prior))
    var_g = y_var * h2
    var_e = y_var * (1.0 - h2)
    gamma = var_e / var_g if var_g > 0 else 1.0

    # Build MME
    # Fixed effect X: (N_train, 1) of all ones
    # Random effect Z: (N_train, N_total) binary incidence matrix
    Z = np.zeros((n_train, n_total), dtype=float)
    for row_idx, col_idx in enumerate(train_indices):
        Z[row_idx, col_idx] = 1.0

    X = np.ones((n_train, 1), dtype=float)

    # LHS:
    # Top-left: X'X (1x1) = N_train
    # Top-right: X'Z (1xN_total)
    # Bottom-left: Z'X (N_totalx1)
    # Bottom-right: Z'Z + gamma * G_inv (N_total x N_total)
    LHS_11 = np.array([[float(n_train)]])
    LHS_12 = np.sum(Z, axis=0, keepdims=True)  # (1, N_total)
    LHS_21 = LHS_12.T  # (N_total, 1)

    ZtZ = np.zeros((n_total, n_total), dtype=float)
    for idx in train_indices:
        ZtZ[idx, idx] += 1.0

    LHS_22 = ZtZ + gamma * G_inv

    LHS = np.block([[LHS_11, LHS_12], [LHS_21, LHS_22]])

    # RHS:
    # [ X'y ]
    # [ Z'y ]
    RHS_1 = np.array([[float(np.sum(y))]])
    RHS_2 = Z.T @ y.reshape(-1, 1)  # (N_total, 1)
    RHS = np.vstack([RHS_1, RHS_2])

    # Solve LHS * sol = RHS
    try:
        sol = linalg.solve(LHS, RHS)
        C_inv = linalg.inv(LHS)
    except linalg.LinAlgError:
        sol = linalg.lstsq(LHS, RHS)[0]
        C_inv = np.eye(LHS.shape[0])

    mu_hat = float(sol[0, 0])
    u_hat = sol[1:, 0]  # length N_total (GEBVs)

    # Reliability calculation per line:
    # r_i^2 = 1 - (PEV_i / (G_ii * var_g)) where PEV_i = C_inv[1+i, 1+i] * var_e
    reliabilities = []
    se_list = []
    for i in range(n_total):
        pev = float(C_inv[1 + i, 1 + i]) * var_e
        g_ii = float(G[i, i])
        denom = g_ii * var_g if (g_ii * var_g) > 0 else 1.0
        rel = 1.0 - (pev / denom)
        rel = max(0.0, min(0.99, rel))
        reliabilities.append(round(rel, 3))
        se_list.append(round(float(math.sqrt(max(0.0, pev))), 3))

    # Compile results for all lines
    train_set = set(train_indices)
    results = []
    for i, name in enumerate(sample_names):
        is_train = i in train_set
        obs_val = phenotypes.get(name) if is_train else None
        gebv_val = float(u_hat[i])
        results.append({
            "sample_id": name,
            "gebv": round(gebv_val, 4),
            "predicted_performance": round(mu_hat + gebv_val, 4),
            "reliability": reliabilities[i],
            "standard_error": se_list[i],
            "is_training": is_train,
            "observed_phenotype": round(float(obs_val), 4) if obs_val is not None else None,
        })

    # Sort descending by GEBV to assign rank
    results.sort(key=lambda x: x["gebv"], reverse=True)
    for rank, item in enumerate(results, start=1):
        item["rank"] = rank

    return {
        "mu": round(mu_hat, 4),
        "variance_genomic": round(var_g, 4),
        "variance_residual": round(var_e, 4),
        "heritability_snp": round(h2, 3),
        "n_training": n_train,
        "n_candidates": n_total - n_train,
        "line_results": results,
    }


def run_k_fold_cross_validation(
    phenotypes: Dict[str, float],
    sample_names: List[str],
    G: np.ndarray,
    k_folds: int = 5,
    heritability_prior: float = 0.50,
) -> Dict[str, Any]:
    """
    Perform k-fold cross validation to assess empirical prediction accuracy r(GEBV, y).
    """
    sample_idx_map = {name: idx for idx, name in enumerate(sample_names)}
    matched_pairs = [
        (name, phenotypes[name])
        for name in sample_names
        if name in phenotypes and phenotypes[name] is not None and not np.isnan(phenotypes[name])
    ]

    n_samples = len(matched_pairs)
    if n_samples < 6:
        return {
            "cv_accuracy": None,
            "cv_mse": None,
            "k_folds": k_folds,
            "warning": "Insufficient matched phenotype-genotype pairs for cross-validation.",
        }

    k = min(k_folds, n_samples)
    indices = np.arange(n_samples)
    np.random.seed(42)
    np.random.shuffle(indices)
    folds = np.array_split(indices, k)

    all_observed = []
    all_predicted = []

    for fold_test_indices in folds:
        test_names = {matched_pairs[i][0] for i in fold_test_indices}
        # Mask test fold
        train_pheno = {
            name: val for name, val in phenotypes.items() if name not in test_names
        }

        try:
            fit = fit_gblup_solver(
                train_pheno, sample_names, G, heritability_prior=heritability_prior
            )
            gebv_lookup = {
                item["sample_id"]: item["predicted_performance"]
                for item in fit["line_results"]
            }

            for idx in fold_test_indices:
                t_name, t_obs = matched_pairs[idx]
                if t_name in gebv_lookup:
                    all_observed.append(float(t_obs))
                    all_predicted.append(float(gebv_lookup[t_name]))
        except Exception as exc:
            logger.warning("Cross-validation fold failed: %s", exc)
            continue

    if len(all_observed) < 3:
        return {
            "cv_accuracy": None,
            "cv_mse": None,
            "k_folds": k,
            "warning": "Cross-validation did not produce sufficient predictions.",
        }

    obs_arr = np.array(all_observed)
    pred_arr = np.array(all_predicted)

    # Pearson correlation r
    corr_matrix = np.corrcoef(obs_arr, pred_arr)
    r = float(corr_matrix[0, 1]) if not np.isnan(corr_matrix[0, 1]) else 0.0
    mse = float(np.mean((obs_arr - pred_arr) ** 2))

    return {
        "cv_accuracy": round(r, 3),
        "cv_mse": round(mse, 4),
        "k_folds": k,
        "n_evaluated": len(all_observed),
        "warning": None,
    }


# ==============================================================================
# 5. Diagnostic Wheat Markers Catalog & Stacking Engine
# ==============================================================================

DEFAULT_WHEAT_DIAGNOSTIC_MARKERS = [
    {
        "name": "csLV34",
        "gene_symbol": "Lr34 / Yr18 / Sr57",
        "chromosome": "7DS",
        "target_trait": "Adult Plant Rust Resistance (Leaf, Stripe, Stem) & Powdery Mildew",
        "trait_category": "disease",
        "favorable_allele": "Resistance (150bp / +)",
        "unfavorable_allele": "Susceptible (229bp / -)",
        "assay_type": "KASP",
        "effect_description": "Pleiotropic ABC transporter confering durable, multi-pathogen adult plant resistance without hypersensitive response.",
    },
    {
        "name": "Fhb1-SNP",
        "gene_symbol": "Fhb1 (TaHRC)",
        "chromosome": "3BS",
        "target_trait": "Fusarium Head Blight Resistance (Type II spread resistance)",
        "trait_category": "disease",
        "favorable_allele": "Favorable (Deletion / Resistance)",
        "unfavorable_allele": "Susceptible (Wildtype)",
        "assay_type": "KASP",
        "effect_description": "Major QTL explaining 25-40% of variance in FHB fungal spread resistance in the wheat spike.",
    },
    {
        "name": "Rht-B1_SNP",
        "gene_symbol": "Rht-B1 (Rht1)",
        "chromosome": "4BS",
        "target_trait": "Semi-Dwarf Plant Height & Lodging Resistance",
        "trait_category": "agronomic",
        "favorable_allele": "Rht-B1b (Semi-dwarf / G)",
        "unfavorable_allele": "Rht-B1a (Tall / A)",
        "assay_type": "KASP",
        "effect_description": "Green Revolution gibberellin-insensitive semi-dwarfing allele preventing lodging in high-yield irrigated environments.",
    },
    {
        "name": "Rht-D1_SNP",
        "gene_symbol": "Rht-D1 (Rht2)",
        "chromosome": "4DS",
        "target_trait": "Semi-Dwarf Plant Height & Lodging Resistance",
        "trait_category": "agronomic",
        "favorable_allele": "Rht-D1b (Semi-dwarf / T)",
        "unfavorable_allele": "Rht-D1a (Tall / C)",
        "assay_type": "KASP",
        "effect_description": "Alternative GA-insensitive semi-dwarfing gene widely deployed across global spring and winter wheat.",
    },
    {
        "name": "Ppd-D1_KASP",
        "gene_symbol": "Ppd-D1",
        "chromosome": "2DS",
        "target_trait": "Photoperiod Insensitivity & Early Heading",
        "trait_category": "phenology",
        "favorable_allele": "Ppd-D1a (Insensitive / Early)",
        "unfavorable_allele": "Ppd-D1b (Sensitive / Late)",
        "assay_type": "KASP",
        "effect_description": "Promotes early flowering and terminal drought escape in Mediterranean and low-latitude mega-environments.",
    },
    {
        "name": "Gpc-B1_KASP",
        "gene_symbol": "Gpc-B1 (NAM-B1)",
        "chromosome": "6BS",
        "target_trait": "Grain Protein Content & Micronutrient Density (Zn/Fe)",
        "trait_category": "quality",
        "favorable_allele": "High Protein (+)",
        "unfavorable_allele": "Standard / Non-functional (-)",
        "assay_type": "KASP",
        "effect_description": "Transcription factor accelerating leaf senescence and nitrogen/micronutrient remobilization into grain.",
    },
    {
        "name": "Sr2_KASP",
        "gene_symbol": "Sr2",
        "chromosome": "1BL",
        "target_trait": "Stem Rust Adult Plant Resistance (Puccinia graminis)",
        "trait_category": "disease",
        "favorable_allele": "Sr2-Resistant",
        "unfavorable_allele": "Susceptible",
        "assay_type": "KASP",
        "effect_description": "Foundation durable stem rust resistance locus linked to pseudo-black chaff pigmentation.",
    },
    {
        "name": "Glu-D1_5+10",
        "gene_symbol": "Glu-D1",
        "chromosome": "1DL",
        "target_trait": "High Molecular Weight Glutenin / Bread Baking Dough Strength",
        "trait_category": "quality",
        "favorable_allele": "Glu-D1d (Subunit 5+10)",
        "unfavorable_allele": "Glu-D1a (Subunit 2+12)",
        "assay_type": "KASP",
        "effect_description": "Major glutenin subunit pair delivering superior dough elasticity, loaf volume, and bread-making strength.",
    },
]


def seed_default_wheat_markers(program: Optional[Program] = None) -> List[DiagnosticMarker]:
    """Populate default wheat diagnostic markers if they do not yet exist."""
    created_markers = []
    for item in DEFAULT_WHEAT_DIAGNOSTIC_MARKERS:
        marker, created = DiagnosticMarker.objects.get_or_create(
            name=item["name"],
            defaults={
                "gene_symbol": item["gene_symbol"],
                "chromosome": item["chromosome"],
                "target_trait": item["target_trait"],
                "trait_category": item["trait_category"],
                "favorable_allele": item["favorable_allele"],
                "unfavorable_allele": item["unfavorable_allele"],
                "assay_type": item["assay_type"],
                "effect_description": item["effect_description"],
                "program": program,
            },
        )
        if created:
            created_markers.append(marker)
    return created_markers


def compute_mas_stacking_matrix(
    germplasm_ids: Optional[List[int]] = None,
    program_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Generate a full Lines x Diagnostic Markers matrix with favorable allele counts,
    heterozygous calls, unfavorable calls, and stacking index.
    """
    # Seed markers if empty
    if not DiagnosticMarker.objects.exists():
        seed_default_wheat_markers()

    markers_qs = DiagnosticMarker.objects.all().order_by("trait_category", "name")
    if program_id:
        markers_qs = markers_qs.filter(
            models.Q(program__isnull=True) | models.Q(program_id=program_id)
        )

    markers = list(markers_qs)
    total_markers = len(markers)
    if total_markers == 0:
        return {"markers": [], "lines": []}

    germplasm_qs = Germplasm.objects.all().select_related("program")
    if germplasm_ids:
        germplasm_qs = germplasm_qs.filter(id__in=germplasm_ids)
    elif program_id:
        germplasm_qs = germplasm_qs.filter(program_id=program_id)

    germplasm_list = list(germplasm_qs[:100])  # limit to 100 lines if unfiltered

    # Fetch all scores for these markers & lines
    scores = MarkerScore.objects.filter(
        marker__in=markers, germplasm__in=germplasm_list
    ).select_related("marker", "germplasm")

    score_map: Dict[Tuple[int, int], MarkerScore] = {
        (s.germplasm_id, s.marker_id): s for s in scores
    }

    lines_data = []
    for g in germplasm_list:
        fav_count = 0
        het_count = 0
        unfav_count = 0
        missing_count = 0
        calls_dict = {}

        for m in markers:
            score = score_map.get((g.id, m.id))
            status = score.call_status if score else "missing"
            raw = score.raw_genotype if score else ""

            if status == "favorable":
                fav_count += 1
            elif status == "heterozygous":
                het_count += 1
            elif status == "unfavorable":
                unfav_count += 1
            else:
                missing_count += 1

            calls_dict[m.id] = {
                "marker_name": m.name,
                "gene_symbol": m.gene_symbol,
                "call_status": status,
                "raw_genotype": raw,
            }

        # Stacking score: 1.0 per favorable, 0.5 per heterozygous, scaled to 100%
        stacking_score = (
            ((fav_count * 1.0 + het_count * 0.5) / total_markers) * 100.0
            if total_markers > 0
            else 0.0
        )

        lines_data.append({
            "germplasm_id": g.id,
            "germplasm_name": g.name,
            "germplasm_db_id": g.germplasm_db_id,
            "program_name": g.program.name if g.program else "",
            "favorable_count": fav_count,
            "heterozygous_count": het_count,
            "unfavorable_count": unfav_count,
            "missing_count": missing_count,
            "stacking_score": round(stacking_score, 1),
            "calls": calls_dict,
        })

    # Sort lines descending by stacking score
    lines_data.sort(key=lambda x: x["stacking_score"], reverse=True)

    markers_meta = [
        {
            "id": m.id,
            "name": m.name,
            "gene_symbol": m.gene_symbol,
            "chromosome": m.chromosome,
            "target_trait": m.target_trait,
            "trait_category": m.trait_category,
            "favorable_allele": m.favorable_allele,
            "assay_type": m.assay_type,
        }
        for m in markers
    ]

    return {
        "total_markers": total_markers,
        "markers": markers_meta,
        "lines": lines_data,
    }
