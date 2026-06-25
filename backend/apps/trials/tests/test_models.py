import pytest
from apps.core.models import Program, Location, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Trial, Plot
from apps.trials.utils import generate_rcbd_layout, create_plots_for_trial


@pytest.mark.django_db
def test_generate_rcbd_layout_consistency():
    program = Program.objects.create(name='Trial Program')
    entries = [Germplasm.objects.create(name=f'Line{i}', germplasm_db_id=f'G{i:03d}', program=program) for i in range(1, 5)]
    layouts1 = generate_rcbd_layout(entries, num_reps=2, seed=42)
    layouts2 = generate_rcbd_layout(entries, num_reps=2, seed=42)

    assert layouts1 == layouts2
    assert len(layouts1) == 2
    assert all(len(rep_list) == 4 for _, rep_list in layouts1)


@pytest.mark.django_db
def test_create_plots_for_trial():
    program = Program.objects.create(name='Trial Program')
    location = Location.objects.create(name='Field')
    season = Season.objects.create(name='2026 Season', year=2026, program=program)
    entries = [Germplasm.objects.create(name=f'Line{i}', germplasm_db_id=f'G{i:03d}', program=program) for i in range(1, 5)]
    trial = Trial.objects.create(
        name='RCBD Test',
        trial_code='TR1',
        program=program,
        location=location,
        season=season,
        design_type='RCBD',
        num_reps=2,
    )

    created = create_plots_for_trial(trial, entries, seed=42)
    assert len(created) == 8
    assert Plot.objects.filter(trial=trial).count() == 8

    plot_numbers = list(Plot.objects.filter(trial=trial).values_list('plot_number', flat=True))
    assert sorted(plot_numbers) == list(range(1, 9))


@pytest.mark.django_db
def test_plot_unique_number_within_trial():
    program = Program.objects.create(name='Trial Program')
    location = Location.objects.create(name='Field')
    season = Season.objects.create(name='2026 Season', year=2026, program=program)
    entry = Germplasm.objects.create(name='LineA', germplasm_db_id='G001', program=program)
    trial = Trial.objects.create(
        name='Unique Plot Test',
        trial_code='TR2',
        program=program,
        location=location,
        season=season,
        design_type='RCBD',
        num_reps=1,
    )

    Plot.objects.create(trial=trial, germplasm=entry, rep=1, plot_number=1)
    with pytest.raises(Exception):
        Plot.objects.create(trial=trial, germplasm=entry, rep=1, plot_number=1)
