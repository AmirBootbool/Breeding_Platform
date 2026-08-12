import pytest

from django.core.exceptions import ValidationError

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Plot, Trial
from apps.trials.services import (
    create_plots_for_trial,
    generate_alpha_lattice_layout,
    generate_augmented_layout,
)


@pytest.mark.django_db
def test_generate_alpha_lattice_layout():
    program = Program.objects.create(name="Trial Program")
    entries = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 13)
    ]

    # Valid run: 12 entries, block_size=4, 3 reps -> 36 plots total
    layout = generate_alpha_lattice_layout(entries, num_reps=3, block_size=4, seed=42)
    assert len(layout) == 36

    # Check rep, block structure
    reps = [row["rep"] for row in layout]
    assert reps.count(1) == 12
    assert reps.count(2) == 12
    assert reps.count(3) == 12

    # Check incomplete block numbers: 3 blocks per rep (1, 2, 3)
    blocks_rep1 = [row["incomplete_block"] for row in layout if row["rep"] == 1]
    assert sorted(blocks_rep1) == [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]

    # Divisibility validation
    with pytest.raises(ValidationError):
        generate_alpha_lattice_layout(entries, num_reps=3, block_size=5, seed=42)

    # block_size < 2 validation
    with pytest.raises(ValidationError):
        generate_alpha_lattice_layout(entries, num_reps=3, block_size=1, seed=42)

    # Determinism
    layout2 = generate_alpha_lattice_layout(entries, num_reps=3, block_size=4, seed=42)
    assert [r["germplasm"].id for r in layout] == [r["germplasm"].id for r in layout2]


@pytest.mark.django_db
def test_generate_augmented_layout():
    program = Program.objects.create(name="Trial Program")
    entries = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 25)
    ]
    check_entries = entries[:4]  # 4 checks
    test_entries = entries[4:]  # 20 test entries

    # Valid run: 4 reps, 4 checks, 20 tests -> 4 * 4 + 20 = 36 plots total
    layout = generate_augmented_layout(entries, check_entries, num_reps=4, seed=42)
    assert len(layout) == 36

    # Verify check replication count and test entry count
    check_ids = {c.id for c in check_entries}
    test_ids = {t.id for t in test_entries}

    check_plots = [row for row in layout if row["germplasm"].id in check_ids]
    test_plots = [row for row in layout if row["germplasm"].id in test_ids]

    assert len(check_plots) == 16  # 4 checks * 4 reps
    assert len(test_plots) == 20  # each test entry appears exactly once
    assert all(row["is_check"] for row in check_plots)
    assert all(not row["is_check"] for row in test_plots)

    # Edge case: empty check_entries -> behaves as fully unreplicated
    unrep_layout = generate_augmented_layout(entries, [], num_reps=3, seed=42)
    assert len(unrep_layout) == 24
    assert all(not row["is_check"] for row in unrep_layout)

    # Determinism
    layout2 = generate_augmented_layout(entries, check_entries, num_reps=4, seed=42)
    assert [r["germplasm"].id for r in layout] == [r["germplasm"].id for r in layout2]


@pytest.mark.django_db
def test_create_plots_for_trial_all_designs():
    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    entries = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 13)
    ]

    # 1. Alpha-lattice trial
    trial_alpha = Trial.objects.create(
        name="Alpha Trial",
        trial_code="TR-ALPHA",
        program=program,
        location=location,
        season=season,
        design_type="alpha_lattice",
        num_reps=2,
        block_size=3,
    )
    plots = create_plots_for_trial(trial_alpha, entries, seed=42)
    assert len(plots) == 24
    assert Plot.objects.filter(trial=trial_alpha).count() == 24
    # All plots should have incomplete_block set (values 1..4)
    incomplete_blocks = Plot.objects.filter(trial=trial_alpha).values_list(
        "incomplete_block", flat=True
    )
    assert all(ib is not None for ib in incomplete_blocks)
    assert set(incomplete_blocks) == {1, 2, 3, 4}

    # 2. Augmented trial
    trial_augmented = Trial.objects.create(
        name="Augmented Trial",
        trial_code="TR-AUG",
        program=program,
        location=location,
        season=season,
        design_type="augmented",
        num_reps=3,
    )
    # 3 checks, 9 tests -> 3 * 3 + 9 = 18 plots
    checks = entries[:3]
    plots_aug = create_plots_for_trial(
        trial_augmented, entries, seed=42, check_entries=checks
    )
    assert len(plots_aug) == 18
    assert Plot.objects.filter(trial=trial_augmented).count() == 18

    # Assert checks marked
    check_plots = Plot.objects.filter(trial=trial_augmented, is_check=True)
    assert check_plots.count() == 9
    assert all(p.germplasm in checks for p in check_plots)


from apps.trials.models import AnalysisSet, Observation, ObservationVariable
from apps.trials.services import (
    compute_cross_environment_ranking,
    compute_heritability,
    validate_analysis_set_coverage,
)


@pytest.mark.django_db
def test_analysis_services_with_synthetic_datasets():
    program = Program.objects.create(name="Trial Program")
    loc1 = Location.objects.create(name="Loc1")
    loc2 = Location.objects.create(name="Loc2")
    season1 = Season.objects.create(name="2024", year=2024, program=program)
    season2 = Season.objects.create(name="2025", year=2025, program=program)

    # Create 3 germplasms with pedigree links
    # G1 and G2 share both parents (full-sibs)
    # G3 is unrelated
    gp_female = Germplasm.objects.create(name="FemaleParent", program=program)
    gp_male = Germplasm.objects.create(name="MaleParent", program=program)

    g1 = Germplasm.objects.create(
        name="G1", program=program, parent_female=gp_female, parent_male=gp_male
    )
    g2 = Germplasm.objects.create(
        name="G2", program=program, parent_female=gp_female, parent_male=gp_male
    )
    g3 = Germplasm.objects.create(name="G3", program=program)

    t1 = Trial.objects.create(
        name="Trial 1", trial_code="T1", program=program, location=loc1, season=season1
    )
    t2 = Trial.objects.create(
        name="Trial 2", trial_code="T2", program=program, location=loc2, season=season2
    )

    var = ObservationVariable.objects.create(
        name="Yield", variable_code="YLD", unit="kg/ha", data_type="numeric"
    )

    # 1. Test heritability & ranking warning on insufficient data (< 10 observations or < 2 environments)
    aset = AnalysisSet.objects.create(name="Test Analysis Set", program=program)
    aset.trials.add(t1)

    res_insufficient = compute_heritability(aset, var)
    assert res_insufficient["h2"] is None
    assert "spans only one season/location combination" in res_insufficient["warning"]

    # Now add T2 to gain 2 environments
    aset.trials.add(t2)

    # Still insufficient count of observations (< 10)
    res_count = compute_heritability(aset, var)
    assert res_count["h2"] is None
    assert "Insufficient data" in res_count["warning"]

    # 2. Populate synthetic data with high heritability (large genotype variance, low residual)
    # G1: consistently high (10.0 in Env1, 9.8 in Env2)
    # G2: consistently medium (7.0 in Env1, 7.1 in Env2)
    # G3: consistently low (4.0 in Env1, 4.2 in Env2)
    plots = []
    obs_list = []

    # We need >= 10 observations. Let's create 2 replications per trial per genotype -> 3 genotypes * 2 reps * 2 trials = 12 plots
    plot_num = 1
    for trial, env_idx in [(t1, 1), (t2, 2)]:
        for rep in [1, 2]:
            for g, base_val in [(g1, 10.0), (g2, 7.0), (g3, 4.0)]:
                # Add minor environment & replication noise
                val = base_val + (0.1 * env_idx) + (0.05 * rep)
                plot = Plot.objects.create(
                    trial=trial, germplasm=g, rep=rep, plot_number=plot_num
                )
                obs = Observation.objects.create(
                    plot=plot, variable=var, value_numeric=val
                )
                plot_num += 1

    # Fit mixed model on this high-heritability dataset
    res_high = compute_heritability(aset, var)
    assert res_high["h2"] is not None
    assert res_high["h2"] > 0.5
    assert res_high["n_environments"] == 2
    assert res_high["n_genotypes"] == 3
    assert res_high["warning"] is None

    # Verify cross-environment ranking
    ranking = compute_cross_environment_ranking(aset, var)
    assert len(ranking) == 3
    # G1 should rank first
    assert ranking[0]["germplasm"] == "G1"
    assert ranking[0]["adjusted_mean"] > ranking[1]["adjusted_mean"]
    # Check pedigree family group in result payload
    assert ranking[0]["family_group"] == f"full_f{gp_female.id}_m{gp_male.id}"
    assert ranking[1]["family_group"] == f"full_f{gp_female.id}_m{gp_male.id}"
    assert ranking[2]["family_group"] == f"unrelated_{g3.id}"
