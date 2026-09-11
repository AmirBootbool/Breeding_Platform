import numpy as np
import pytest

from apps.genomics.services import (
    compute_vanraden_grm,
    fit_gblup_solver,
    run_k_fold_cross_validation,
)


def test_fit_gblup_solver():
    sample_names = [f"Wheat_Line_{i}" for i in range(1, 9)]
    # Random dosage matrix (8 lines x 20 SNPs)
    np.random.seed(42)
    M = np.random.choice([0.0, 1.0, 2.0], size=(8, 20), p=[0.5, 0.2, 0.3])
    G = compute_vanraden_grm(M)

    # 5 observed training lines, 3 unobserved candidate lines
    phenotypes = {
        "Wheat_Line_1": 45.2,
        "Wheat_Line_2": 52.0,
        "Wheat_Line_3": 38.5,
        "Wheat_Line_4": 49.1,
        "Wheat_Line_5": 41.0,
    }

    res = fit_gblup_solver(phenotypes, sample_names, G, heritability_prior=0.45)

    assert res["n_training"] == 5
    assert res["n_candidates"] == 3
    assert len(res["line_results"]) == 8

    # All 8 lines must have GEBV predictions and ranks
    for item in res["line_results"]:
        assert "gebv" in item
        assert "reliability" in item
        assert "rank" in item
        assert item["rank"] in range(1, 9)

    # Candidate lines must have is_training == False and observed_phenotype == None
    cand_items = [r for r in res["line_results"] if not r["is_training"]]
    assert len(cand_items) == 3
    for cand in cand_items:
        assert cand["sample_id"] in ["Wheat_Line_6", "Wheat_Line_7", "Wheat_Line_8"]
        assert cand["observed_phenotype"] is None


def test_run_k_fold_cross_validation():
    sample_names = [f"Wheat_Line_{i}" for i in range(1, 11)]
    np.random.seed(42)
    M = np.random.choice([0.0, 1.0, 2.0], size=(10, 25))
    G = compute_vanraden_grm(M)

    # Generate correlated phenotypes with SNP additive effects
    true_effects = np.random.normal(0, 1, 25)
    genotypic_values = M @ true_effects
    noise = np.random.normal(0, 0.5, 10)
    phenotypes = {
        sample_names[i]: float(genotypic_values[i] + noise[i])
        for i in range(10)
    }

    cv_res = run_k_fold_cross_validation(
        phenotypes, sample_names, G, k_folds=3, heritability_prior=0.60
    )

    assert cv_res["cv_accuracy"] is not None
    assert -1.0 <= cv_res["cv_accuracy"] <= 1.0
    assert cv_res["cv_mse"] is not None
