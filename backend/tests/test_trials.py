import pytest
from apps.core.models import Program, Location, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Trial, Plot
from apps.trials.utils import generate_rcbd_layout, create_plots_for_trial


@pytest.mark.django_db
def test_generate_rcbd_layout_and_create(db):
    program = Program.objects.create(name='Test Program')
    location = Location.objects.create(name='Test Farm')
    season = Season.objects.create(year=2026, name='2026 Season', program=program)

    # create germplasm entries
    entries = []
    for i in range(1, 7):
        g = Germplasm.objects.create(name=f'Line{i}', germplasm_db_id=f'G{i}', program=program)
        entries.append(g)

    trial = Trial.objects.create(name='Trial1', trial_code='T1', program=program, location=location, season=season, design_type='RCBD', num_reps=2)

    layouts = generate_rcbd_layout(entries, num_reps=2, seed=42)
    assert len(layouts) == 2
    assert all(len(rep_list) == 6 for _, rep_list in layouts)

    created = create_plots_for_trial(trial, entries, seed=42)
    assert Plot.objects.filter(trial=trial).count() == 12
    # check unique plot numbers
    plot_numbers = list(Plot.objects.filter(trial=trial).values_list('plot_number', flat=True))
    assert len(set(plot_numbers)) == 12

    # check ordering consistency with same seed
    layouts2 = generate_rcbd_layout(entries, num_reps=2, seed=42)
    assert layouts == layouts2
