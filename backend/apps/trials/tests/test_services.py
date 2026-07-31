import pytest
from django.core.exceptions import ValidationError

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Trial, Plot
from apps.trials.services import (
    generate_alpha_lattice_layout,
    generate_augmented_layout,
    create_plots_for_trial,
)


@pytest.mark.django_db
def test_generate_alpha_lattice_layout():
    program = Program.objects.create(name="Trial Program")
    entries = [
        Germplasm.objects.create(name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program)
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
        Germplasm.objects.create(name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program)
        for i in range(1, 25)
    ]
    check_entries = entries[:4]  # 4 checks
    test_entries = entries[4:]   # 20 test entries

    # Valid run: 4 reps, 4 checks, 20 tests -> 4 * 4 + 20 = 36 plots total
    layout = generate_augmented_layout(entries, check_entries, num_reps=4, seed=42)
    assert len(layout) == 36

    # Verify check replication count and test entry count
    check_ids = {c.id for c in check_entries}
    test_ids = {t.id for t in test_entries}

    check_plots = [row for row in layout if row["germplasm"].id in check_ids]
    test_plots = [row for row in layout if row["germplasm"].id in test_ids]

    assert len(check_plots) == 16  # 4 checks * 4 reps
    assert len(test_plots) == 20   # each test entry appears exactly once
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
        Germplasm.objects.create(name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program)
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
    incomplete_blocks = Plot.objects.filter(trial=trial_alpha).values_list("incomplete_block", flat=True)
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
    plots_aug = create_plots_for_trial(trial_augmented, entries, seed=42, check_entries=checks)
    assert len(plots_aug) == 18
    assert Plot.objects.filter(trial=trial_augmented).count() == 18

    # Assert checks marked
    check_plots = Plot.objects.filter(trial=trial_augmented, is_check=True)
    assert check_plots.count() == 9
    assert all(p.germplasm in checks for p in check_plots)
