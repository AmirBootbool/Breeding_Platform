import pytest

from django.core.exceptions import ValidationError

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial
from apps.trials.utils import create_plots_for_trial, generate_rcbd_layout


@pytest.mark.django_db
def test_generate_rcbd_layout_consistency():
    program = Program.objects.create(name="Trial Program")
    entries = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 5)
    ]
    layouts1 = generate_rcbd_layout(entries, num_reps=2, seed=42)
    layouts2 = generate_rcbd_layout(entries, num_reps=2, seed=42)

    assert layouts1 == layouts2
    assert len(layouts1) == 2
    assert all(len(rep_list) == 4 for _, rep_list in layouts1)


@pytest.mark.django_db
def test_create_plots_for_trial():
    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    entries = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 5)
    ]
    trial = Trial.objects.create(
        name="RCBD Test",
        trial_code="TR1",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=2,
    )

    created = create_plots_for_trial(trial, entries, seed=42)
    assert len(created) == 8
    assert all(plot.id is not None for plot in created)
    assert Plot.objects.filter(trial=trial).count() == 8

    plot_numbers = list(
        Plot.objects.filter(trial=trial).values_list("plot_number", flat=True)
    )
    assert sorted(plot_numbers) == list(range(1, 9))


@pytest.mark.django_db
def test_plot_unique_number_within_trial():
    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    entry = Germplasm.objects.create(
        name="LineA", germplasm_db_id="G001", program=program
    )
    trial = Trial.objects.create(
        name="Unique Plot Test",
        trial_code="TR2",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )

    Plot.objects.create(trial=trial, germplasm=entry, rep=1, plot_number=1)
    with pytest.raises(Exception):
        Plot.objects.create(trial=trial, germplasm=entry, rep=1, plot_number=1)


@pytest.mark.django_db
def test_observation_variable_and_observation_creation():
    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    entry = Germplasm.objects.create(
        name="LineA", germplasm_db_id="G001", program=program
    )
    trial = Trial.objects.create(
        name="Observation Trial",
        trial_code="TR3",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )
    plot = Plot.objects.create(trial=trial, germplasm=entry, rep=1, plot_number=1)

    variable = ObservationVariable.objects.create(
        name="Plant Height",
        variable_code="PH",
        data_type="numeric",
        unit="cm",
        min_value=0,
        max_value=500,
        is_required=True,
    )

    observation = Observation.objects.create(
        plot=plot,
        variable=variable,
        value_numeric=85.5,
        observation_time="2026-05-01T10:00:00Z",
    )

    assert Observation.objects.count() == 1
    assert observation.value_numeric == 85.5
    assert observation.plot == plot
    assert observation.variable == variable


@pytest.mark.django_db
def test_observation_validation_for_numeric_variable():
    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    entry = Germplasm.objects.create(
        name="LineA", germplasm_db_id="G001", program=program
    )
    trial = Trial.objects.create(
        name="Validation Trial",
        trial_code="TR4",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )
    plot = Plot.objects.create(trial=trial, germplasm=entry, rep=1, plot_number=1)
    variable = ObservationVariable.objects.create(
        name="Plant Height",
        variable_code="PH",
        data_type="numeric",
        unit="cm",
        is_required=True,
    )

    with pytest.raises(ValidationError):
        Observation.objects.create(plot=plot, variable=variable)


@pytest.mark.django_db
def test_deleting_germplasm_with_plots_raises():
    from django.db.models import ProtectedError

    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    germplasm = Germplasm.objects.create(
        name="LineA", germplasm_db_id="G001", program=program
    )
    trial = Trial.objects.create(
        name="Unique Plot Test",
        trial_code="TR2",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )
    Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=1)

    with pytest.raises(ProtectedError):
        germplasm.delete()


@pytest.mark.django_db
def test_deleting_location_with_trials_raises():
    from django.db.models import ProtectedError

    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    Trial.objects.create(
        name="Unique Plot Test",
        trial_code="TR2",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )

    with pytest.raises(ProtectedError):
        location.delete()


@pytest.mark.django_db
def test_deleting_season_with_trials_raises():
    from django.db.models import ProtectedError

    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)
    Trial.objects.create(
        name="Unique Plot Test",
        trial_code="TR2",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )

    with pytest.raises(ProtectedError):
        season.delete()


@pytest.mark.django_db
def test_trial_alpha_lattice_validation():
    program = Program.objects.create(name="Trial Program")
    location = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026 Season", year=2026, program=program)

    # Missing block_size for alpha_lattice
    t1 = Trial(
        name="Alpha Lattice Missing Block",
        trial_code="TR-A1",
        program=program,
        location=location,
        season=season,
        design_type="alpha_lattice",
        num_reps=2,
    )
    with pytest.raises(ValidationError) as exc_info:
        t1.clean()
    assert "block_size" in exc_info.value.message_dict

    # block_size < 2 for alpha_lattice
    t2 = Trial(
        name="Alpha Lattice Small Block",
        trial_code="TR-A2",
        program=program,
        location=location,
        season=season,
        design_type="alpha_lattice",
        num_reps=2,
        block_size=1,
    )
    with pytest.raises(ValidationError) as exc_info:
        t2.clean()
    assert "block_size" in exc_info.value.message_dict

    # Valid alpha_lattice trial
    t3 = Trial(
        name="Alpha Lattice Valid",
        trial_code="TR-A3",
        program=program,
        location=location,
        season=season,
        design_type="alpha_lattice",
        num_reps=2,
        block_size=3,
    )
    t3.clean()  # Should not raise validation error


from apps.trials.models import AnalysisSet
from apps.trials.services import validate_analysis_set_coverage


@pytest.mark.django_db
def test_analysis_set_creation_and_coverage():
    program = Program.objects.create(name="Trial Program")
    loc1 = Location.objects.create(name="Loc1")
    loc2 = Location.objects.create(name="Loc2")
    season1 = Season.objects.create(name="2024", year=2024, program=program)
    season2 = Season.objects.create(name="2025", year=2025, program=program)

    t1 = Trial.objects.create(
        name="Trial 1",
        trial_code="TR1",
        program=program,
        location=loc1,
        season=season1,
        design_type="RCBD",
        num_reps=2,
    )
    t2 = Trial.objects.create(
        name="Trial 2",
        trial_code="TR2",
        program=program,
        location=loc2,
        season=season2,
        design_type="RCBD",
        num_reps=2,
    )

    analysis_set = AnalysisSet.objects.create(
        name="Multi-Env Yield Set",
        program=program,
        description="A test analysis set",
    )
    analysis_set.trials.add(t1)

    # Only 1 environment coverage check
    warning = validate_analysis_set_coverage(analysis_set)
    assert warning is not None
    assert "spans only one season/location combination" in warning

    # Add second trial to gain 2 environments
    analysis_set.trials.add(t2)
    warning = validate_analysis_set_coverage(analysis_set)
    assert warning is None
